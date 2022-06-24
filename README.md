# Blazor Mentions

https://user-images.githubusercontent.com/31552590/175610537-238875c5-90dd-4539-b5d9-3ba5e1f525c1.mp4

**This repository is an experiment in creating a component to manage completions,
this is not ready to use**

This is an attempt to implement a powerfull yet simple component to handle mentions
and other completions, it's implemented using [MudBlazor](https://mudblazor.com/)
and a content editable.

- [x] Support others characters to open the popover
- [x] Customizable markers colors through css
- [x] Copy and paste mentions
- [x] Get the editor content as a string
- [ ] Get the editor content as a tree of tokens
- [x] Show a tooltip when the mouse is over a `mention`

## Quick Start

```sh
git clone https://github.com/drocha87/blazorServerMentions
cd blazorServerMentions
dotnet watch run
```

## Usage

`IMention` is the interface which is used to provide information about a mention.

```csharp
public interface IMention
{
    char Marker { get; set; }
    string Text { get; set; }
    string Value { get; set; }
    string Description { get; set; }
    string? Avatar { get; set; }
}
```

`SearchFunc` is a delegate with the following signature:

```csharp
Func<char, string, Task<IEnumerable<IMention>>>? SearchFunc
```

`Markers` is a string with a list of characters that will trigger the popover with the suggestions.

Every time a marker is typed **SearchFunc** will be called to handle the query (_text after the marker_)
and the marker itself. You must handle the suggestion properly based on the marker as the example below:

```csharp
private async Task<IEnumerable<IMention>> SearchItems(char marker, string query)
{
    return marker switch
    {
        '@' => await ProfileSvc.GetProfilesAsMentions(query, limit: 5),
        '#' => await TagSvc.GetTags(query, limit: 5),
        _ => throw new InvalidDataException(nameof(marker)),
    };
}
```

```html
<MentionTextarea @ref="_mention" Markers="@("@#")" SearchFunc="SearchItems">
    <SuggestionContentItem>
        @* RenderFragment that will be rendered inside a MudListItem *@
    </SuggestionContentItem>

    <TooltipContent>
        @* RenderFragment that will be rendered inside the MudPopover *@
    </TooltipContent>
</MentionTextarea>
```


## Customization

To customize a mention you can edit the css file for example `wwwroot/style.css` addind the following content.

```css
/* to customize all mentions */
span[data-mention] {
  padding: 0 2px;
  border-radius: 4px;
  cursor: pointer;
}

/* to customize the mention with the marker @ */
span[data-mention="@"] {
    background-color: #bde0fe;
}

/* to customize the mention with the marker # */
span[data-mention="#"] {
  background-color: #fbc4ab;
}
```
