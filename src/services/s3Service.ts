import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// Initialize S3 client
// Default region is me-central-1 (UAE - Dubai) - optimal for UAE-based operations
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'me-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Support environment-specific buckets
// Format: AWS_S3_BUCKET_NAME_DEV, AWS_S3_BUCKET_NAME_PROD
// Falls back to AWS_S3_BUCKET_NAME if environment-specific not set
const getBucketName = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const envBucket = env === 'production' 
    ? process.env.AWS_S3_BUCKET_NAME_PROD 
    : process.env.AWS_S3_BUCKET_NAME_DEV;
  
  return envBucket || process.env.AWS_S3_BUCKET_NAME || '';
};

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Upload a file to S3
 * @param file - File buffer or stream
 * @param folder - Folder path in S3 (e.g., 'dishes', 'categories', 'restaurants')
 * @param originalName - Original filename
 * @param contentType - MIME type of the file
 * @returns Promise with S3 URL and key
 */
export async function uploadToS3(
  file: Buffer,
  folder: string,
  originalName: string,
  contentType: string
): Promise<UploadResult> {
  const bucketName = getBucketName();
  if (!bucketName) {
    throw new Error('AWS S3 bucket name is not configured. Please set AWS_S3_BUCKET_NAME or environment-specific bucket name.');
  }

  // Generate unique filename
  const fileExtension = originalName.split('.').pop() || 'jpg';
  const uniqueFileName = `${crypto.randomUUID()}.${fileExtension}`;
  const key = `${folder}/${uniqueFileName}`;

  // Upload to S3
  // Note: ACL is removed because modern S3 buckets (created after April 2023) 
  // have ACLs disabled by default. Use bucket policy for public access instead.
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file,
    ContentType: contentType,
    // ACL removed - bucket policy should allow public read access
  });

  await s3Client.send(command);

  // Construct public URL
  // For us-east-1, the URL format is slightly different (no region in URL)
  const region = process.env.AWS_REGION || 'me-central-1';
  const url = region === 'us-east-1'
    ? `https://${bucketName}.s3.amazonaws.com/${key}`
    : `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

  return { url, key };
}

/**
 * Delete a file from S3
 * @param key - S3 object key (full path)
 */
export async function deleteFromS3(key: string): Promise<void> {
  const bucketName = getBucketName();
  if (!bucketName) {
    throw new Error('AWS S3 bucket name is not configured. Please set AWS_S3_BUCKET_NAME or environment-specific bucket name.');
  }

  // Extract key from URL if full URL is provided
  const s3Key = key.includes('amazonaws.com/') 
    ? key.split('amazonaws.com/')[1] 
    : key;

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  await s3Client.send(command);
}

/**
 * Extract S3 key from a full S3 URL
 * @param url - Full S3 URL
 * @returns S3 key
 */
export function extractS3Key(url: string): string {
  if (url.includes('amazonaws.com/')) {
    return url.split('amazonaws.com/')[1];
  }
  return url;
}

