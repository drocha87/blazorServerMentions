using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

using MudBlazor;

namespace blazorServerMentions.Components;

public interface IMentionItem
{
    // FIXME: this property should be named differently
    string Username { get; set; }
}


public class ElementTextContent
{
    public string? Content { get; set; }
    public int Row { get; set; }
    public int Col { get; set; }
}

public partial class MentionTextArea<T> : ComponentBase, IDisposable
    where T : IMentionItem
{
    [Inject] IJSRuntime JS { get; set; } = null!;

    private string? _text;

    [Parameter]
    public string? Text
    {
        get => _text;
        set
        {
            _text = value;
            TextChanged.InvokeAsync(_text).AndForget();
        }
    }
    [Parameter] public EventCallback<string> TextChanged { get; set; }

    [Parameter] public string? Placeholder { get; set; }
    [Parameter] public int DebounceTimer { get; set; } = 500;
    [Parameter] public int MaxSuggestions { get; set; } = 5;
    [Parameter] public Func<string, Task<IEnumerable<T>?>> SearchFunc { get; set; } = null!;

    [Parameter] public RenderFragment<T>? SuggestionContentItem { get; set; }

    private ElementReference? _editor;
    private bool _showMentionBox = false;

    private string? CurrentWord { get; set; }

    private IEnumerable<T>? _suggestions;
    private object SelectedSuggestionIndex { get; set; } = 0;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            var reference = DotNetObjectReference.Create(this);
            await JS.InvokeVoidAsync("mentionEditor.initialize", reference);
        }
    }

    public async Task<string> GetContent()
    {
        var content = await JS.InvokeAsync<string>("mentionEditor.getContent");
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
            _suggestions = null;
        }
    }

    public async void OnSearchAsync(object? sender, EventArgs e)
    {
        DisposeTimer();
        if (!string.IsNullOrEmpty(CurrentWord) && SearchFunc is not null)
        {
            _suggestions = await SearchFunc(CurrentWord[1..]);
            await InvokeAsync(StateHasChanged);
        }
    }

    public async Task OnItemSelected(T item)
    {
        await JS.InvokeVoidAsync("mentionEditor.insertMentionAtHighlighted", item.Username!);
        await InvokeAsync(ResetMentions);
    }

    private void ResetMentions()
    {
        if (_showMentionBox)
        {
            DisposeTimer();
            _showMentionBox = false;
            _suggestions = null;
            SelectedSuggestionIndex = 0;
            CurrentWord = null;
        }
    }

    private void OpenMentionBox()
    {
        if (!_showMentionBox)
        {
            _showMentionBox = true;
            _suggestions = null;
        }
    }

    private async Task CheckKey(KeyboardEventArgs ev)
    {
        if (_showMentionBox)
        {
            // handle keys if mention box is opened
            switch (ev.Key)
            {
                case "ArrowUp":
                    // handle next suggestion
                    SelectedSuggestionIndex = (int)SelectedSuggestionIndex - 1;
                    if ((int)SelectedSuggestionIndex < 0)
                    {
                        SelectedSuggestionIndex = _suggestions!.Count() - 1;
                    }
                    return;

                case "ArrowDown":
                    // handle next suggestion
                    SelectedSuggestionIndex = (int)SelectedSuggestionIndex + 1;
                    if ((int)SelectedSuggestionIndex >= _suggestions!.Count())
                    {
                        SelectedSuggestionIndex = 0;
                    }
                    return;

                case "Enter":
                    if ((int)SelectedSuggestionIndex < _suggestions!.Count())
                    {
                        await OnItemSelected(_suggestions!.ElementAt((int)SelectedSuggestionIndex));
                    }
                    return;

                case "Escape":
                    await InvokeAsync(ResetMentions);
                    return;
            }
        }
    }

    public class Token
    {
        public TokenType Type { get; set; } = TokenType.Text;
        public string Value { get; set; } = null!;
    }

    public enum TokenType
    {
        Mention,
        Text,
    }

    [JSInvokable]
    public Task<List<Token>> ParseLine(string? text)
    {
        List<Token> tokens = new();
        if (text is not null && _editor is not null)
        {
            // FIXME: for some reason if I have an empty space followed by a new line
            // I'll have an additional string with length 0. It should not happen, I think
            // the problem is with the regex I'm using to split the text.
            string[] parts = Regex.Split(text, @"([.,;\s])");
            foreach (var part in parts)
            {
                if (part.Length > 0)
                {
                    tokens.Add(new()
                    {
                        Type = part switch
                        {
                            var x when x.StartsWith("@") => TokenType.Mention,
                            _ => TokenType.Text,
                        },
                        Value = part
                    });
                }
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
    public async Task PopoverMentionInfo(MentionPopover p)
    {
        // Console.WriteLine($"username: {p.Username}, top: {p.Top}, left: {p.Left}");
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

    private int _currentLine = 1;
    private int _currentCol = 1;

    [JSInvokable]
    public async Task OnUpdateStats(int line, int col)
    {
        _currentLine = line;
        _currentCol = col;
        await InvokeAsync(StateHasChanged);
    }

    public void Dispose()
    {
        DisposeTimer();
        JS.InvokeVoidAsync("mentionEditor.dispose").AndForget();
        GC.SuppressFinalize(this);
    }
}