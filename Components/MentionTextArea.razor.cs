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

public partial class MentionTextArea<T> : ComponentBase, IAsyncDisposable
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
    [Parameter] public bool HighlightWord { get; set; } = false;
    [Parameter] public bool HighlightLine { get; set; } = false;

    [Parameter] public int DebounceTimer { get; set; } = 500;
    [Parameter] public int MaxSuggestions { get; set; } = 5;
    [Parameter] public Func<string, Task<IEnumerable<T>?>> SearchFunc { get; set; } = null!;

    [Parameter] public RenderFragment<T>? SuggestionContentItem { get; set; }

    private ElementReference? _editor;
    private bool _showMentionBox = false;

    private string? CurrentWord { get; set; }

    public class Line
    {
        public List<Token>? Tokens { get; set; }
    }
    private List<Line>? _lines;

    private IEnumerable<T>? _suggestions;
    private object SelectedSuggestionIndex { get; set; } = 0;

    private IJSObjectReference? _jsEditor;
    private IJSObjectReference? _jsEditorContext;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _jsEditor = await JS.InvokeAsync<IJSObjectReference>("import", "./scripts/components/editor.js");
            var reference = DotNetObjectReference.Create(this);
            await _jsEditor.InvokeVoidAsync("editor.initialize", reference);
            _lines = new();
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
        await _jsEditor!.InvokeVoidAsync("editor.insertMentionAtHighlighted", item.Username!);
        await InvokeAsync(ResetMentions);
    }

    private async Task ResetMentions()
    {
        if (_showMentionBox)
        {
            DisposeTimer();
            _showMentionBox = false;
            _suggestions = null;
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

        public int Index { get; set; }
        public int Start { get; set; }
        public int End { get; set; }
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
            IEnumerable<string> parts = Regex.Split(text, @"([.,;\s])").Where(x => x.Length > 0);

            int offset = 0;
            foreach (var (part, index) in parts.Select((v, i) => (v, i)))
            {
                var end = part.Length;
                tokens.Add(new()
                {
                    Type = part switch
                    {
                        var x when x.StartsWith("@") => TokenType.Mention,
                        _ => TokenType.Text,
                    },
                    Value = part,
                    Index = index,
                    Start = offset,
                    End = offset + end,
                });
                offset += end;
            }
        }
        return Task.FromResult(tokens);
    }

    [JSInvokable]
    public async Task UpdateCaretPosition(object selection)
    {
        Console.WriteLine(selection);
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


    public async ValueTask DisposeAsync()
    {
        try
        {
            DisposeTimer();

            if (_jsEditor is not null)
            {
                await _jsEditor.DisposeAsync();
            }

            if (_jsEditorContext is not null)
            {
                await _jsEditorContext.DisposeAsync();
            }

            GC.SuppressFinalize(this);
        }
        catch (JSDisconnectedException) { }
        catch (TaskCanceledException) { }
    }
}