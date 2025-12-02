# Set Up AWS S3 for Image Storage

The application uses AWS S3 to store uploaded images. You need **2 S3 buckets** (dev and prod) and **1 IAM user**.

**Region:** `me-central-1` (UAE - Dubai)

---

## 1. Create IAM User

1. Navigate to **IAM → Users → Create user**
2. Attach a custom policy (minimal S3 Access) (replace bucket names with yours):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::tawfir-images-dev/*",
           "arn:aws:s3:::tawfir-images-prod/*",
           "arn:aws:s3:::tawfir-images-dev",
           "arn:aws:s3:::tawfir-images-prod"
         ]
       }
     ]
   }
   ```

## 2. Create Access Keys

1. Go to **IAM → Users → [Your User] → Security credentials tab**
2. Scroll to **"Access keys"** section
3. Click **"Create access key"**
4. Select **"Application running outside AWS"**
5. Click **"Create access key"**
6. **Copy and save both:**
   - Access Key ID
   - Secret Access Key (click "Show" to reveal)
   - ⚠️ **You can only see the Secret Access Key once!**

## 3. Create S3 Buckets

**Development Bucket:**
- S3 → Create bucket
- Name: `tawfir-images-dev`
- Region: `me-central-1`
- Uncheck "Block all public access" (if you want public URLs)
- Create bucket

**Production Bucket:**
- Same steps, name: `tawfir-images-prod`

## 4. Configure Buckets

**CORS (for both buckets):**
- Bucket → Permissions → CORS → Add:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedOrigins": ["*"],
       "ExposeHeaders": []
     }
   ]
   ```

**Public Read (for both buckets):**
- Bucket → Permissions → Bucket policy → Add:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
       }
     ]
   }
   ```

## 5. Update .env File

**Development:**
```env
AWS_REGION=me-central-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME_DEV=tawfir-images-dev
NODE_ENV=development
```

**Production:**
```env
AWS_REGION=me-central-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME_PROD=tawfir-images-prod
NODE_ENV=production
```

**Note:** Use the same IAM credentials for both environments. The app automatically selects the correct bucket based on `NODE_ENV`.

---

## PostgreSQL Tables Linked to S3

The following PostgreSQL tables store S3 image URLs:
- **`dishes`** - `image` column (dish images)
- **`food_categories`** - `image` column (category images)
- **`restaurants`** - `profile_pic` column (restaurant profile pictures)
- **`restaurants`** - `cover_image` column (restaurant cover images)
