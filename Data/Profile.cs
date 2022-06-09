using blazorServerMentions.Components;

namespace blazorServerMentions.Data;

public class Profile : IMentionProfile
{
    public string Username { get; set; } = null!;

    public string? Name;
    public string? Avatar;
}