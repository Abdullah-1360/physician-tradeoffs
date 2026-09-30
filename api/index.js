/**
 * Vercel Serverless Function Entry Point
 * Proxies API requests directly to Express application
 */
process.env.VERCEL = '1';
const app = require('../server');

module.exports = app;
