import {
    BlobServiceClient,
    StorageSharedKeyCredential,
    generateBlobSASQueryParameters,
    BlobSASPermissions,
} from '@azure/storage-blob';

// Loaded lazily by app/lib/s3.ts only when STORAGE_PROVIDER=azure-blob, so the
// Azure SDK is never bundled/initialized for the AWS deployment.

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || '';
const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || '';
const ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY || '';

function getServiceClient(): BlobServiceClient {
    if (CONNECTION_STRING) {
        return BlobServiceClient.fromConnectionString(CONNECTION_STRING);
    }
    if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
        throw new Error(
            'Azure Blob storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING, ' +
            'or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY.',
        );
    }
    return new BlobServiceClient(
        `https://${ACCOUNT_NAME}.blob.core.windows.net`,
        new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY),
    );
}

function getContainerClient() {
    if (!CONTAINER) {
        throw new Error('AZURE_STORAGE_CONTAINER env var is not set.');
    }
    return getServiceClient().getContainerClient(CONTAINER);
}

export async function uploadToBlob(
    buffer: Buffer,
    key: string,
    contentType: string,
): Promise<string> {
    const blockBlobClient = getContainerClient().getBlockBlobClient(key);
    await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType },
    });
    return key;
}

export async function getSignedBlobDownloadUrl(
    key: string,
    expiresIn = 3600,
): Promise<string> {
    const containerClient = getContainerClient();
    const blobClient = containerClient.getBlobClient(key);

    if (CONNECTION_STRING && !ACCOUNT_KEY) {
        // Connection strings embed their own key; parse it out for SAS signing.
        const match = /AccountName=([^;]+);AccountKey=([^;]+)/.exec(CONNECTION_STRING);
        if (!match) {
            throw new Error('Could not derive account key from AZURE_STORAGE_CONNECTION_STRING for SAS signing.');
        }
        const credential = new StorageSharedKeyCredential(match[1], match[2]);
        return signUrl(blobClient.url, containerClient.containerName, key, credential, expiresIn);
    }

    const credential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
    return signUrl(blobClient.url, containerClient.containerName, key, credential, expiresIn);
}

function signUrl(
    blobUrl: string,
    containerName: string,
    blobName: string,
    credential: StorageSharedKeyCredential,
    expiresIn: number,
): string {
    const now = new Date();
    const sas = generateBlobSASQueryParameters(
        {
            containerName,
            blobName,
            permissions: BlobSASPermissions.parse('r'),
            startsOn: now,
            expiresOn: new Date(now.getTime() + expiresIn * 1000),
        },
        credential,
    ).toString();
    return `${blobUrl}?${sas}`;
}

export async function deleteFromBlob(key: string): Promise<void> {
    await getContainerClient().getBlockBlobClient(key).deleteIfExists();
}
