import {
  SCAN_FROM,
  SCAN_TO,
  SCAN_CORNERS,
  type DecryptionFrame,
} from "./decryption";

export function inspectionSegments(frame: DecryptionFrame) {
  const point = (t: number): [number, number] => [
    SCAN_FROM[0] + (SCAN_TO[0] - SCAN_FROM[0]) * t,
    SCAN_FROM[1] + (SCAN_TO[1] - SCAN_FROM[1]) * t,
  ];
  return frame.intervals.map(([a, b]) => [point(a), point(b)] as const);
}

export class InspectionOverlay {
  private root = document.querySelector<SVGSVGElement>("#inspection-marks")!;
  private line = this.root.querySelector<SVGPathElement>("#inspection-lines")!;
  private corners = this.root.querySelector<SVGGElement>(
    "#inspection-corners",
  )!;
  private point =
    this.root.querySelector<SVGCircleElement>("#inspection-point")!;
  private label = document.querySelector<HTMLElement>("#inspection-text")!;
  private host = document.querySelector<HTMLElement>("#three-scene")!;
  private visible = false;
  private cornersVisible = false;
  private width = 0;
  private height = 0;

  render(
    frame: DecryptionFrame,
    project: (x: number, y: number) => number[],
    showLabel: boolean,
    enabled = true,
  ) {
    const visible =
      enabled &&
      Boolean(frame.intervals.length || frame.markers > 0 || frame.point > 0);
    if (!visible) {
      if (this.visible) {
        this.root.style.opacity = "0";
        this.label.style.opacity = "0";
      }
      this.visible = false;
      return;
    }
    if (!this.visible) this.root.style.opacity = "1";
    this.visible = true;
    const { clientWidth: width, clientHeight: height } = this.host;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
    if (this.root.dataset.phase !== frame.phase)
      this.root.dataset.phase = frame.phase;
    const referenceTime = frame.time.toFixed(3);
    if (this.root.dataset.referenceTime !== referenceTime)
      this.root.dataset.referenceTime = referenceTime;
    this.line.setAttribute(
      "d",
      inspectionSegments(frame)
        .map(([a, b]) => `M${project(...a)}L${project(...b)}`)
        .join(""),
    );
    this.corners.style.opacity = String(frame.markers);
    if (frame.markers > 0) {
      this.corners.innerHTML = SCAN_CORNERS.map(([x, y]) => {
        const [px, py] = project(x, y);
        return `<rect x="${px - 4}" y="${py - 4}" width="8" height="8"/>`;
      }).join("");
      this.cornersVisible = true;
    } else if (this.cornersVisible) {
      this.corners.replaceChildren();
      this.cornersVisible = false;
    }
    const [cx, cy] = project(
      (SCAN_FROM[0] + SCAN_TO[0]) / 2,
      (SCAN_FROM[1] + SCAN_TO[1]) / 2,
    );
    this.point.setAttribute("cx", String(cx));
    this.point.setAttribute("cy", String(cy));
    this.point.style.opacity = String(frame.point);
    this.label.style.opacity = String(showLabel ? frame.label : 0);
    this.label.querySelector<HTMLElement>("strong")!.style.opacity = String(
      frame.labelValue,
    );
  }
}
