using System.ComponentModel.DataAnnotations;

namespace backend.Dtos
{
    public class SquareConnectionDto
    {
        [Required]
        public string SquareMerchantId { get; set; } = string.Empty;

        [Required]
        public string SquareAccessToken { get; set; } = string.Empty;
    }
}
