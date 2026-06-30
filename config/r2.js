const { S3Client } = require('@aws-sdk/client-s3');
const https = require('https');
const http = require('http');

const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    forcePathStyle: true,
    requestHandler: {
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true
        })
    }
});

module.exports = { r2Client };
