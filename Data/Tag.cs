using blazorServerMentions.Components;

namespace blazorServerMentions.Data;

public class Tag : IMention
{
    public char Marker { get; set; } = '#';
    public string Text { get; set; } = null!;
    public string Value { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string? Avatar { get; set; }
}