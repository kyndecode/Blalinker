export default async function globalSetup() {
  process.env.DATABASE_URL    = 'postgresql://test:test@localhost:5432/test_bla';
  process.env.JWT_PRIVATE_KEY = 'test-private-key';
  process.env.JWT_PUBLIC_KEY  = 'test-public-key';
  process.env.ENCRYPTION_KEY  = 'a'.repeat(64);
  process.env.REDIS_URL       = 'redis://localhost:6379';
  process.env.NODE_ENV        = 'test';
}
