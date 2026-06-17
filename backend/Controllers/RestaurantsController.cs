using Microsoft.AspNetCore.Mvc;
using backend.Services;
using backend.Dtos;
using backend.Models;
using AutoMapper;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/restaurants")]
    public class RestaurantsController : ControllerBase
    {
        private readonly ISupabaseService _supabase;
        private readonly IMapper _mapper;
        private readonly ISquareMenuSyncService _squareMenuSync;

        public RestaurantsController(ISupabaseService supabase, IMapper mapper, ISquareMenuSyncService squareMenuSync)
        {
            _supabase = supabase;
            _mapper = mapper;
            _squareMenuSync = squareMenuSync;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var Restaurants = await _supabase.GetRestaurantsAsync();
            var dtos = _mapper.Map<IEnumerable<RestaurantDto>>(Restaurants);
            return Ok(dtos);
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            var Restaurant = await _supabase.GetRestaurantByIdAsync(id);
            var dto = _mapper.Map<RestaurantDto>(Restaurant);
            return Restaurant == null ? NotFound() : Ok(dto);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] RestaurantDto dto)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);
            var Restaurant = _mapper.Map<Restaurant>(dto);
            var create = await _supabase.CreateRestaurantAsync(Restaurant);
            if (create == null) return StatusCode(500, "Failed to create Restaurant");
            var readDto = _mapper.Map<RestaurantDto>(create);
            return CreatedAtAction(nameof(Get), new { id = readDto.Id }, readDto);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] RestaurantDto dto)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);
            var Restaurant = _mapper.Map<Restaurant>(dto);
            var updated = await _supabase.UpdateRestaurantAsync(id, Restaurant);
            return updated == null ? NotFound() : Ok(_mapper.Map<RestaurantDto>(updated));
        }

        [HttpPost("{id:int}/square/connect")]
        public async Task<IActionResult> ConnectSquare(int id, [FromBody] SquareConnectionDto dto, CancellationToken ct)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var restaurant = await _supabase.GetRestaurantByIdAsync(id);
            if (restaurant == null) return NotFound();

            restaurant.SquareId = dto.SquareMerchantId.Trim();
            restaurant.SquareAccessToken = dto.SquareAccessToken.Trim();

            try
            {
                var upserted = await _squareMenuSync.ImportMenuItemsAsync(id, restaurant.SquareAccessToken, ct);
                var updated = await _supabase.UpdateRestaurantAsync(id, restaurant);
                if (updated == null) return StatusCode(500, "Failed to save Square connection.");

                return Ok(new
                {
                    restaurantId = id,
                    squareMerchantId = restaurant.SquareId,
                    upserted
                });
            }
            catch (Exception ex)
            {
                return BadRequest($"Square connection failed: {ex.Message}");
            }
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var ok = await _supabase.DeleteRestaurantAsync(id);
            return !ok ? NotFound() : NoContent();
        }
    }
}
