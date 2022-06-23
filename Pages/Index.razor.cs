using blazorServerMentions.Components;
using blazorServerMentions.Data;
using blazorServerMentions.Services;
using Microsoft.AspNetCore.Components;

namespace blazorServerMentions.Pages;

public partial class Index : ComponentBase
{
    [Inject] public ProfileService ProfileSvc { get; set; } = null!;
    [Inject] public TagService TagSvc { get; set; } = null!;

    public string? Content { get; set; }

    private MentionTextarea? _mention;

    private async Task<IEnumerable<IMention>> SearchItems(char marker, string query)
    {
        return marker switch
        {
            // XXX: each marker should request different content, I'm requesting the same
            //      just for demonstration purpose
            '@' => await ProfileSvc.GetProfilesAsMentions(query, limit: 5),
            '#' => await TagSvc.GetTags(query, limit: 5),
            _ => throw new InvalidDataException(nameof(marker)),
        };
    }

    private async Task GetContent()
    {
        if (_mention is not null)
        {
            Content = await _mention.GetContent();
        }
    }

}