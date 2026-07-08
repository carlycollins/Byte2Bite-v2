using backend.Models;
using backend.Services;
using backend.Mapping;
using Square;
using Square.Catalog;
using Supabase;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);

// Square API
// Pull settings (make sure you stored them with dotnet user-secrets or env vars)
var accessToken = builder.Configuration["Square:AccessToken"];
var environment = builder.Configuration["Square:Environment"] ?? "sandbox";

// Supabase API
var supabaseUrl = builder.Configuration["Supabase:Url"]
    ?? throw new InvalidOperationException("Supabase:Url is missing.");
var supabaseAnonKey = builder.Configuration["Supabase:AnonKey"]
    ?? throw new InvalidOperationException("Supabase:AnonKey is missing.");
var supabaseServiceKey = builder.Configuration["Supabase:ServiceKey"]
    ?? throw new InvalidOperationException("Supabase:ServiceKey is missing.");
var supabaseAuthIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1";

// AutoMapper
builder.Services.AddAutoMapper(cfg => { }, typeof(AutoMapperProfile));

builder.Services.AddScoped<ISupabaseService, SupabaseService>();
builder.Services.AddSingleton<ISquareClientFactory, SquareClientFactory>();
builder.Services.AddHttpClient<ISquareOAuthService, SquareOAuthService>();
builder.Services.AddScoped<ISquareMenuSyncService, SquareMenuSyncService>();
builder.Services.AddScoped<ISquareOrderSyncService, SquareOrderSyncService>();
if (!string.IsNullOrWhiteSpace(accessToken))
{
    builder.Services.AddHostedService<SquareOrderSyncBackgroundService>();
}
builder.Services.AddSingleton(_ => new SquareClient(
    token: accessToken ?? string.Empty,
    clientOptions: new ClientOptions
    {
        BaseUrl = environment.Equals("production", StringComparison.OrdinalIgnoreCase)
            ? SquareEnvironment.Production
            : SquareEnvironment.Sandbox
    }));

// Register minimal services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MetadataAddress = $"{supabaseUrl}/auth/v1/.well-known/jwks.json";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = false,
            ValidIssuers = new[] { supabaseUrl.TrimEnd('/'), supabaseAuthIssuer }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddDataProtection();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy
            .WithOrigins("http://localhost:8081")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowReactApp");
app.UseAuthentication();
app.UseAuthorization();
app.UseHttpsRedirection();
app.MapControllers();

using var startupCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
await RunSupabaseSmokeTestAsync(app.Services, startupCts.Token);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "BYTE2BITE API V1");
        options.RoutePrefix = "swagger";
    });
}

await app.RunAsync();

static async Task RunSupabaseSmokeTestAsync(IServiceProvider services, CancellationToken cancellationToken = default)
{
    await using var scope = services.CreateAsyncScope();
    var supabaseService = scope.ServiceProvider.GetRequiredService<ISupabaseService>();
    var client = supabaseService.Client;

    try
    {
        // Just a basic call to ensure Supabase connection works
        var response = await client.From<Ingredient>().Get(cancellationToken: cancellationToken);
        Console.WriteLine($"Supabase connected, retrieved {response.Models.Count} row(s).");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Supabase test failed: {ex.Message}");
    }
}
