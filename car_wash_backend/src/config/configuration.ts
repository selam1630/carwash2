export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigins: process.env.CORS_ORIGINS || '*',
    trustProxy: (process.env.TRUST_PROXY || '').toLowerCase() === 'true',
  },
  security: {
    piiActiveKeyId: process.env.PII_ENCRYPTION_ACTIVE_KEY_ID || '',
    piiKeys: process.env.PII_ENCRYPTION_KEYS || '',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    synchronize:
      process.env.DB_SYNCHRONIZE != null
        ? String(process.env.DB_SYNCHRONIZE).toLowerCase() === 'true'
        : (process.env.NODE_ENV || 'development') !== 'production',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpires: '30d',
  },
  sms: {
    providerApiKey: process.env.SMS_API_KEY
  },
  redis:{
    host:process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  wash: {
    dispatchAcceptTimeoutMs: parseInt(
      process.env.WASH_DISPATCH_ACCEPT_TIMEOUT_MS || '30000',
      10,
    ),
  },
  commission:{
    amountPerOwner:parseFloat(process.env.COMMISSION_PER_OWNER || '0.0'),
    amountPerOwnerDirect: parseFloat(
      process.env.COMMISSION_PER_OWNER_DIRECT || '0.0',
    ),
    amountPerOwnerRecruiter: parseFloat(
      process.env.COMMISSION_PER_OWNER_RECRUITER || '0.0',
    ),
    amountPerRecruitedSales: parseFloat(
      process.env.COMMISSION_PER_RECRUITED_SALES || '0.0',
    ),
  }
});
