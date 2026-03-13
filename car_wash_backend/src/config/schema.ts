import * as Joi from 'joi';

export default Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  CORS_ORIGINS: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  PII_ENCRYPTION_ACTIVE_KEY_ID: Joi.string().allow('').optional(),
  PII_ENCRYPTION_KEYS: Joi.string().allow('').optional(),
  WASH_DISPATCH_ACCEPT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(5000)
    .max(120000)
    .default(30000),
});
