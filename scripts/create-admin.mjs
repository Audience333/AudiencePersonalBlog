import { createUser, hasAdmin } from '../src/lib/db.ts';
import { hashPassword, validPassword, validUsername } from '../src/lib/auth.ts';

function askHidden(label) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || !input.setRawMode) {
      reject(new Error('请在交互式终端中运行此命令。'));
      return;
    }
    let value = '';
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    const onData = (chunk) => {
      const key = chunk.toString('utf8');
      if (key === '\r' || key === '\n') {
        input.off('data', onData);
        input.setRawMode(false);
        process.stdout.write('\n');
        resolve(value);
      } else if (key === '\u0003') {
        input.off('data', onData);
        input.setRawMode(false);
        reject(new Error('已取消。'));
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else if (key >= ' ' && key !== '\u001b') {
        value += key;
      }
    };
    input.on('data', onData);
  });
}

try {
  const username = process.argv[2] || 'admin';
  if (!validUsername(username)) throw new Error('管理员用户名需为 3–24 位字母、数字、中文、下划线或连字符。');
  if (hasAdmin()) throw new Error('管理员已存在；此命令不会覆盖现有管理员。');
  console.log(`即将创建管理员：${username}`);
  const password = await askHidden('密码（至少 12 位，输入时不显示）：');
  if (!validPassword(password)) throw new Error('密码长度需为 12–128 位。');
  const confirmation = await askHidden('再次输入密码：');
  if (password !== confirmation) throw new Error('两次密码不一致。');
  createUser(username, await hashPassword(password), 'admin');
  console.log('管理员创建成功。现在可以启动网站并登录 /login/。');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
