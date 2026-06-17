using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/menu")]
    public class MenuController : ControllerBase
    {
        private readonly ISquareMenuSyncService _syncService;

        public MenuController(ISquareMenuSyncService syncService)
        {
            _syncService = syncService;
        }

        [HttpPost("import")]
        public async Task<IActionResult> Import([FromQuery] int restaurantId, CancellationToken ct)
        {
            if (restaurantId <= 0) return BadRequest("restaurantId must be a positive integer.");

            try
            {
                var count = await _syncService.ImportMenuItemsForRestaurantAsync(restaurantId, ct);
                return Ok(new { upserted = count });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
        }
    }
}
