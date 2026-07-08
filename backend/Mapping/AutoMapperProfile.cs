using AutoMapper;
using backend.Dtos;
using backend.Models;

namespace backend.Mapping
{
    public class AutoMapperProfile : Profile
    {
        public AutoMapperProfile()
        {
            // Map Ingredient <-> ReadIngredientDto
            CreateMap<Ingredient, ReadIngredientDto>().ReverseMap();

            // Map Ingredient <-> WriteIngredientDto
            CreateMap<Ingredient, WriteIngredientDto>().ReverseMap();

            // Map Restaurant <-> RestaurantDto
            CreateMap<Restaurant, RestaurantDto>()
                .ForMember(dest => dest.SquareConnected, opt => opt.MapFrom(src =>
                    !string.IsNullOrWhiteSpace(src.SquareId) &&
                    !string.IsNullOrWhiteSpace(src.SquareAccessToken)));
            CreateMap<RestaurantDto, Restaurant>()
                .ForMember(dest => dest.SquareAccessToken, opt => opt.Ignore())
                .ForMember(dest => dest.SquareMerchantToken, opt => opt.Ignore())
                .ForMember(dest => dest.SquareRefreshToken, opt => opt.Ignore())
                .ForMember(dest => dest.SquareTokenExpiresAt, opt => opt.Ignore());

            // Map UserProfile <-> UserDto
            CreateMap<UserProfile, UserDto>().ReverseMap();

            // Map ItemDto -> Item
            CreateMap<Item, ItemDto>()
                .ForMember(dest => dest.TotalCost, opt => opt.MapFrom(src => src.Total_Cost ?? 0m))
                .ForMember(dest => dest.ProfitMargin, opt => opt.MapFrom(src => src.Profit_Margin))
                .ReverseMap()
                .ForMember(dest => dest.Total_Cost, opt => opt.MapFrom(src => src.TotalCost ?? 0m))
                .ForMember(dest => dest.Profit_Margin, opt => opt.MapFrom(src => src.ProfitMargin));

            // Map DistributorDto -> Distributor
            CreateMap<DistributorDto, Distributor>();
        }
    }
}
