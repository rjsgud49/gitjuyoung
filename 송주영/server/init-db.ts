/**
 * 최초 1회 실행: DB/테이블 생성 + 기본 아이템 데이터 삽입
 * 실행: npm run db:init
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_ITEMS, ITEMS_VERSION } from '../src/data/defaultItems';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // DB 이름 없이 연결 (DB 생성 위해)
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     ?? '127.0.0.1',
    port:     parseInt(process.env.DB_PORT ?? '3306', 10),
    user:     process.env.DB_USER     ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    charset:  'utf8mb4',
    multipleStatements: true,
  });

  console.log('📦 스키마 적용 중...');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);

  console.log('⚙️  global_config 초기화...');
  await conn.query(
    `INSERT INTO gacha.global_config (id, gacha_items_version, gacha_pull_cost, starting_coins)
     VALUES (1, ?, 10, 30)
     ON DUPLICATE KEY UPDATE id = id`,
    [ITEMS_VERSION]
  );

  console.log(`🎴 기본 아이템 ${DEFAULT_ITEMS.length}개 삽입 중...`);
  await conn.query('DELETE FROM gacha.gacha_items');
  await conn.query(
    'INSERT INTO gacha.gacha_items (id, name, rarity, probability, image) VALUES ?',
    [DEFAULT_ITEMS.map(i => [i.id, i.name, i.rarity, i.probability, i.image])]
  );

  await conn.end();
  console.log('✅ 완료!');
}

main().catch(err => { console.error(err); process.exit(1); });
