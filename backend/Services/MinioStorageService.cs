using Minio;
using Minio.DataModel.Args;

namespace BoardRoom.Api.Services;

/// <summary>
/// MinIO object storage service for saving and retrieving images, logos, and digital assets.
/// </summary>
public class MinioStorageService
{
    private readonly IMinioClient _client;
    private readonly string _bucket;
    private readonly ILogger<MinioStorageService> _logger;
    private bool _bucketChecked = false;

    public MinioStorageService(IConfiguration config, ILogger<MinioStorageService> logger)
    {
        _logger = logger;
        var endpoint = config["Minio:Endpoint"] ?? "minio:9000";
        var accessKey = config["Minio:AccessKey"] ?? "minioadmin";
        var secretKey = config["Minio:SecretKey"] ?? "minioadmin";
        _bucket = config["Minio:BucketName"] ?? "boardroom";
        var useSsl = bool.TryParse(config["Minio:UseSSL"], out var ssl) && ssl;

        _client = new MinioClient()
            .WithEndpoint(endpoint)
            .WithCredentials(accessKey, secretKey)
            .WithSSL(useSsl)
            .Build();
    }

    public async Task EnsureBucketAsync(CancellationToken ct = default)
    {
        if (_bucketChecked) return;
        try
        {
            var beArgs = new BucketExistsArgs().WithBucket(_bucket);
            bool found = await _client.BucketExistsAsync(beArgs, ct);
            if (!found)
            {
                var mbArgs = new MakeBucketArgs().WithBucket(_bucket);
                await _client.MakeBucketAsync(mbArgs, ct);
                _logger.LogInformation("MinIO bucket '{Bucket}' created.", _bucket);
            }
            _bucketChecked = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize MinIO bucket '{Bucket}'.", _bucket);
        }
    }

    public async Task<string> UploadLogoAsync(Guid companyId, string fileName, Stream stream, string contentType, long size, CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext)) ext = ".png";
        var objectKey = $"logos/{companyId}/{Guid.NewGuid()}{ext}";

        var poArgs = new PutObjectArgs()
            .WithBucket(_bucket)
            .WithObject(objectKey)
            .WithStreamData(stream)
            .WithObjectSize(size)
            .WithContentType(contentType);

        await _client.PutObjectAsync(poArgs, ct);
        _logger.LogInformation("Uploaded company logo '{ObjectKey}' ({Size} bytes) to MinIO", objectKey, size);
        return objectKey;
    }

    public async Task<(Stream Stream, string ContentType)> GetFileAsync(string objectKey, CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        var ms = new MemoryStream();
        var statArgs = new StatObjectArgs().WithBucket(_bucket).WithObject(objectKey);
        var stat = await _client.StatObjectAsync(statArgs, ct);

        var goArgs = new GetObjectArgs()
            .WithBucket(_bucket)
            .WithObject(objectKey)
            .WithCallbackStream(async (stream, token) =>
            {
                await stream.CopyToAsync(ms, token);
            });

        await _client.GetObjectAsync(goArgs, ct);
        ms.Position = 0;
        return (ms, stat.ContentType ?? "image/png");
    }

    public async Task DeleteFileAsync(string objectKey, CancellationToken ct = default)
    {
        try
        {
            await EnsureBucketAsync(ct);
            var roArgs = new RemoveObjectArgs().WithBucket(_bucket).WithObject(objectKey);
            await _client.RemoveObjectAsync(roArgs, ct);
            _logger.LogInformation("Removed object '{ObjectKey}' from MinIO", objectKey);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete object '{ObjectKey}' from MinIO", objectKey);
        }
    }
}
