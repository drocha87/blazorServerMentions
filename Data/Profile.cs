using blazorServerMentions.Components;

namespace blazorServerMentions.Data;

public class Profile
{
    public string Name { get; set; } = null!;
    public string Username { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string? Avatar { get; set; }
}