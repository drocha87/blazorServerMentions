using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace blazorServerMentions.Components;

public interface IMention
{
    string Text { get; set; }
    string Value { get; set; }
    string Description { get; set; }
    string? Avatar { get; set; }
}

public partial class MentionTextarea : ComponentBase, IAsyncDisposable
{
    [Inject] IJSRuntime JS { get; set; } = null!;

    [Parameter] public EventCallback<string> TextChanged { get; set; }

    [Parameter] public string? Placeholder { get; set; }

    [Parameter] public string Delimiters { get; set; } = @"([.,;\s])";
    [Parameter] public string Markers { get; set; } = "@#";

    [Parameter] public int DebounceTimer { get; set; } = 500;
    [Parameter] public int MaxSuggestions { get; set; } = 5;

    [Parameter] public Func<char, string, Task<IEnumerable<IMention>>>? SearchFunc { get; set; }
    [Parameter] public RenderFragment<IMention>? SuggestionContentItem { get; set; }

    private ElementReference? _editor;
    private bool _showMentionBox = false;

    private string? CurrentWord { get; set; }

    private IEnumerable<IMention> _suggestions = Enumerable.Empty<IMention>();
    private object SelectedSuggestionIndex { get; set; } = 0;

    private IJSObjectReference? _jsEditor;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _jsEditor = await JS.InvokeAsync<IJSObjectReference>("import", "./scripts/components/editor.js");
            var reference = DotNetObjectReference.Create(this);
            await _jsEditor.InvokeVoidAsync("editor.initialize", reference);
        }
        await base.OnAfterRenderAsync(firstRender);
    }

    public async Task<string> GetContent()
    {
        var content = await _jsEditor!.InvokeAsync<string>("editor.getContent");
        return content;
    }

    private System.Timers.Timer? _timer;

    private void StartTimer()
    {
        _timer = new System.Timers.Timer(DebounceTimer);
        _timer.Elapsed += OnSearchAsync;
        _timer.Enabled = true;
        _timer.Start();
    }

    private void DisposeTimer()
    {
        if (_timer is not null)
        {
            _timer.Dispose();
            _timer = null;
            _suggestions = Enumerable.Empty<IMention>();
        }
    }

    public async void OnSearchAsync(object? sender, EventArgs e)
    {
        DisposeTimer();
        if (!string.IsNullOrEmpty(CurrentWord) && SearchFunc is not null)
        {
            var marker = CurrentWord[0];
            var query = CurrentWord[1..];

            _suggestions = await SearchFunc(marker, query);
            await InvokeAsync(StateHasChanged);
        }
    }

    public async Task OnItemSelected(IMention item)
    {
        await _jsEditor!.InvokeVoidAsync("editor.insertMentionAtHighlighted", item.Value);
        await InvokeAsync(ResetMentions);
    }

    private async Task ResetMentions()
    {
        if (_showMentionBox)
        {
            DisposeTimer();
            _showMentionBox = false;
            _suggestions = Enumerable.Empty<IMention>();
            SelectedSuggestionIndex = 0;
            CurrentWord = null;
            await InvokeAsync(StateHasChanged);
        }
    }

    private void OpenMentionBox()
    {
        if (!_showMentionBox)
        {
            _showMentionBox = true;
            _suggestions = Enumerable.Empty<IMention>();
        }
    }

    private async Task CheckKey(KeyboardEventArgs ev)
    {
        if (_showMentionBox && _suggestions.Any())
        {
            // handle keys if mention box is opened
            switch (ev.Key)
            {
                case "ArrowUp":
                    // handle next suggestion
                    SelectedSuggestionIndex = (int)SelectedSuggestionIndex - 1;
                    if ((int)SelectedSuggestionIndex < 0)
                    {
                        SelectedSuggestionIndex = _suggestions.Count() - 1;
                    }
                    return;

                case "ArrowDown":
                    // handle next suggestion
                    SelectedSuggestionIndex = (int)SelectedSuggestionIndex + 1;
                    if ((int)SelectedSuggestionIndex >= _suggestions.Count())
                    {
                        SelectedSuggestionIndex = 0;
                    }
                    return;

                case "Enter":
                    if ((int)SelectedSuggestionIndex < _suggestions!.Count())
                    {
                        await OnItemSelected(_suggestions.ElementAt((int)SelectedSuggestionIndex));
                    }
                    return;

                case "Escape":
                case " ":
                    await InvokeAsync(ResetMentions);
                    return;
            }
            if (ev.Key.Length > 1)
            {
                await InvokeAsync(ResetMentions);
                return;
            }
        }
    }

    public class Token
    {
        public string Value { get; set; } = null!;
        public Dictionary<string, string>? Attributes { get; set; }
    }

    [JSInvokable]
    public Task<List<Token>> Tokenizer(string? text)
    {
        List<Token> tokens = new();
        if (text is not null && _editor is not null)
        {
            // FIXME: for some reason if I have an empty space followed by a new line
            // I'll have an additional string with length 0. It should not happen, I think
            // the problem is with the regex I'm using to split the text.
            IEnumerable<string> parts = Regex.Split(text, Delimiters).Where(x => x.Length > 0);

            int offset = 0;
            foreach (var (part, index) in parts.Select((v, i) => (v, i)))
            {
                var end = part.Length;
                Token token = new()
                {
                    Value = part,
                    Attributes = new()
                    {
                        { "data-word", "" },
                        { "data-wordindex", index.ToString() },
                        { "data-wordstart", offset.ToString() },
                        { "data-wordend", (offset + end).ToString() },
                    }
                };
                if (Markers.Contains(token.Value[0]))
                {
                    token.Attributes.Add("data-mention", $"{token.Value[0]}");
                }

                tokens.Add(token);
                offset += end;
            }
        }
        return Task.FromResult(tokens);
    }

    public class MentionPopover
    {
        public string? Username { get; set; }
        public double Top { get; set; }
        public double Left { get; set; }
    }

    // TODO: implement the popover on mouse hover
    [JSInvokable]
    public Task PopoverMentionInfo(MentionPopover _)
    {
        // Console.WriteLine($"username: {p.Username}, top: {p.Top}, left: {p.Left}");
        return Task.CompletedTask;
    }

    [JSInvokable]
    public async Task OnMention(string word)
    {
        CurrentWord = word;
        var isMentionBoxOpened = _showMentionBox;
        StartTimer();
        await InvokeAsync(OpenMentionBox);
    }

    [JSInvokable]
    public async Task OnCloseMentionPopover()
    {
        await InvokeAsync(ResetMentions);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            DisposeTimer();
            if (_jsEditor is not null)
            {
                await _jsEditor.DisposeAsync();
            }
            GC.SuppressFinalize(this);
        }
        catch (JSDisconnectedException) { }
        catch (TaskCanceledException) { }
    }
}