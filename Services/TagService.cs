using System.Text.RegularExpressions;
using blazorServerMentions.Data;

namespace blazorServerMentions.Services;

public class TagService
{
    private static readonly List<Tag> Tags = new()
    {
        new Tag { Text = "chat", Value = "chat", Description = ""},
        new Tag { Text = "help", Value = "help", Description = ""},
        new Tag { Text = "development", Value = "development", Description = ""},
        new Tag { Text = "showcase", Value = "showcase", Description = ""},
        new Tag { Text = "offtopic", Value = "offtopic", Description = ""},
    };

    public Task<List<Tag>> GetTags(string query, int limit = 5)
    {
        string pattern = query ?? @"^(?!\s*$).+";
        Regex rg = new(pattern, RegexOptions.IgnoreCase);
        return Task.FromResult(Tags.Where(x => rg.IsMatch(x.Value)).Take(limit).ToList());
    }
}