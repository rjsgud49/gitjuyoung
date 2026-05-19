/**
 * DB 연결·테이블·카드 업로드 가능 여부 점검
 * 실행: npm run db:check
 */
import 'dotenv/config';
import { checkDbHealth, initDb } from './store';

async function main() {
  console.log('📋 DB 설정');
  console.log(`   host=${process.env.DB_HOST ?? '127.0.0.1'} port=${process.env.DB_PORT ?? '3306'}`);
  console.log(`   user=${process.env.DB_USER ?? 'root'} database=${process.env.DB_NAME ?? 'gacha'}`);
  console.log('');

  let health = await checkDbHealth();
  if (!health.ok) {
    console.warn('⚠️  문제 발견:', health.error);
    console.log('🔧 initDb() 로 테이블 생성·마이그레이션 시도…');
    await initDb();
    health = await checkDbHealth();
  }

  if (health.ok) {
    console.log('✅ DB 정상');
    if (health.tables) console.log('   tables:', health.tables);
    if (health.gachaItemsIdColumn) console.log(`   gacha_items.id → ${health.gachaItemsIdColumn}`);
    if (health.gachaItemsCount != null) console.log(`   gacha_items 행 수: ${health.gachaItemsCount}`);
    process.exit(0);
  }

  console.error('❌ DB 점검 실패:', health.error);
  console.error('');
  console.error('확인 사항:');
  console.error('  1. MySQL/MariaDB 가 실행 중인지');
  console.error('  2. .env 파일에 DB_PASSWORD 등이 맞는지');
  console.error('  3. 최초 1회: npm run db:init');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
