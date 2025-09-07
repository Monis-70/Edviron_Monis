import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  uri: process.env.ATLAS_MONGODB_URI, // <- use this exact key
  options: {
    maxPoolSize: 10,
    minPoolSize: 5,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
    autoIndex: process.env.NODE_ENV !== 'production',
  },
}));
