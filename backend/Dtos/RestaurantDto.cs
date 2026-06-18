using System.ComponentModel.DataAnnotations;

namespace backend.Dtos
{
    public class RestaurantDto
    {
        [Required]
        public int Id { get; set; }

        [Required]
        public string Name { get; set; } = null!;

        [Required]
        public string ZipCode { get; set; } = null!;

        public string SquareId { get; set; } = string.Empty;

        public bool SquareConnected { get; set; }
    }
}
