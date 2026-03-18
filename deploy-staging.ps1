# Enable required APIs
Write-Host "Enabling Google Cloud APIs..."
gcloud services enable artifactregistry.googleapis.com aiplatform.googleapis.com

# Get the current Google Cloud project ID
$PROJECT_ID = gcloud config get-value project
Write-Host "Current Project ID: $PROJECT_ID"

# Grant the default compute service account the required permissions
Write-Host "Granting required permissions to the default compute service account..."
$SERVICE_ACCOUNT = "648230638146-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SERVICE_ACCOUNT" `
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SERVICE_ACCOUNT" `
  --role="roles/artifactregistry.admin"

# Grant the Vertex AI User role so the backend can call Gemini
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SERVICE_ACCOUNT" `
  --role="roles/aiplatform.user"

# Deploy to Cloud Run
Write-Host "Deploying to Google Cloud Run..."
gcloud run deploy mortgage-intake-staging `
  --region=us-central1 `
  --source=. `
  --port=3001 `
  --allow-unauthenticated `
  --set-env-vars="NODE_ENV=staging,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,INTENTYFI_ENDPOINT=https://api.intentyfi.ai/max/v1,INTENTYFI_PROJECT=Mortgage,INTENTYFI_USER=jc+training@intentyfi.ai,INTENTYFI_PASS=Intent#5"

Write-Host "Deployment script finished!"
