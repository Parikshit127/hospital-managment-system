import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    } : undefined, // Falls back to IAM role on EC2
});

const BUCKET = process.env.AWS_S3_BUCKET || '';

/**
 * Upload a file to S3
 * Returns the S3 key (path) — NOT a public URL
 */
export async function uploadToS3(
    buffer: Buffer,
    key: string,
    contentType: string,
): Promise<string> {
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
    }));
    return key;
}

/**
 * Generate a signed URL for temporary read access (default 1 hour)
 * Use this to serve files — never make the bucket public
 */
export async function getSignedDownloadUrl(
    key: string,
    expiresIn = 3600,
): Promise<string> {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Build a standardized S3 key for patient records
 * Format: patient-records/{orgId}/{patientId}/{timestamp}-{random}.{ext}
 */
export function buildPatientRecordKey(
    orgId: string,
    fileName: string,
    patientId?: string,
): string {
    const ext = fileName.split('.').pop() || 'pdf';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const folder = patientId
        ? `patient-records/${orgId}/${patientId}`
        : `patient-records/${orgId}/general`;
    return `${folder}/${uniqueName}`;
}
