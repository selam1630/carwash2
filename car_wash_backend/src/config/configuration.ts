export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
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
