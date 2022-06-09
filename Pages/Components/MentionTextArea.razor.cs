using System.Text.RegularExpressions;
using blazorServerMentions.Data;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

using MudBlazor;

namespace blazorServerMentions.Pages.Components;

public partial class MentionTextArea : ComponentBase, IDisposable
{
    [Inject] IJSRuntime JS { get; set; } = null!;
    [Inject] ProfileService ProfileSvc { get; set; } = null!;

    private string? _text;
    private List<string>? _texts;

    [Parameter]
    public string? Text
    {
        get => _text;
        set
        {
            _text = value;
            TextChanged.InvokeAsync(_text).AndForget();
            UpdateTexts(_text);
        }
    }
    [Parameter] public EventCallback<string> TextChanged { get; set; }

    [Parameter] public string? Placeholder { get; set; }
    [Parameter] public int DebounceTimer { get; set; } = 500;
    [Parameter] public int MaxSuggestions { get; set; } = 5;

    private ElementReference? _textarea;
    private bool _showMentionBox = false;
    private int? _mentionBoxWidth;

    private int _startCaretPosition = 0;
    private int _caretPosition = 0;
    private int _highlightWord = 0;

    private string? _query;
    private List<Profile>? _suggestions;
    private object _selectedSuggestionIndex = 0;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await JS.InvokeVoidAsync("initializeMentionBox", _textarea);
            _mentionBoxWidth = await JS.InvokeAsync<int>("getElementWidthById", "_mentionBoxContainer");
        }
    }

    protected override void OnParametersSet()
    {
        _texts = new();
    }

    private void UpdateTexts(string? text)
    {
        if (text is not null)
        {
            _texts = new();

            // FIXME: for some reason if I have an empty space followed by a new line
            // I'll have an additional string with length 0. It should not happen, I think
            // the problem is with the regex I'm using the split the text.
            string[] parts = Regex.Split(text, @"([.,;\s])");
            foreach (var part in parts)
            {
                if (part.Length > 0)
                {
                    _texts.Add(part);
                }
            }
        }
    }

    private int CaretPositionToWordIndex(int caret)
    {
        int index = 0;
        if (_texts is not null)
        {
            int acc = 0;
            foreach (var (txt, i) in _texts.Select((txt, i) => (txt, i)))
            {
                index = i;
                acc += txt.Length;
                if (acc >= caret)
                {
                    break;
                }
            }
        }
        return index;
    }

    private async Task UpdateCaretPosition()
    {
        if (_textarea is not null)
        {
            _caretPosition = await JS.InvokeAsync<int>("getElementCaretPosition", _textarea);
            _highlightWord = CaretPositionToWordIndex(_caretPosition);
        }
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
        if (_timer != null)
        {
            _timer.Enabled = false;
            _timer.Elapsed -= OnSearchAsync;
            _timer.Dispose();
            _timer = null;
            _suggestions?.Clear();
        }
    }

    public async void OnSearchAsync(object? sender, EventArgs e)
    {
        DisposeTimer();
        if (!string.IsNullOrEmpty(Text))
        {
            _query = Text[(_startCaretPosition + 1)..];
            _query = _query.Split(" ")[0];

            if (!string.IsNullOrEmpty(_query))
            {
                _suggestions = await ProfileSvc.GetProfiles(_query, MaxSuggestions);
                await InvokeAsync(StateHasChanged);
            }
        }
    }

    public async Task OnSelectedUser(Profile user)
    {
        if (_texts is not null)
        {
            var index = CaretPositionToWordIndex(_startCaretPosition);
            _texts[index] = "@" + user.Username!;

            var cursor = _startCaretPosition + 1 + user.Username!.Length;
            var text = string.Join("", _texts);
            await JS.InvokeVoidAsync("updateMentionBoxText", _textarea, text, cursor);
            ResetMentions();
        }
    }

    private void ResetMentions()
    {
        if (_showMentionBox)
        {
            DisposeTimer();
            _query = null;
            _showMentionBox = false;
            _startCaretPosition = 0;
            _suggestions?.Clear();
            _suggestions = null;
            _selectedSuggestionIndex = 0;
        }
    }

    private async Task OpenMentionBox(int caret)
    {
        _mentionBoxWidth = await JS.InvokeAsync<int>("getElementWidthById", "_mentionBoxContainer");
        _showMentionBox = true;
        _startCaretPosition = caret;
        _query = null;
        _suggestions = null;
    }

    private async Task ShouldOpenMentionBox()
    {
        var caret = await JS.InvokeAsync<int>("getElementCaretPosition", _textarea);

        if (caret > 0 && Text is not null && Text.Length >= caret)
        {
            // getElementCaretPosition return the position indexed by 1 but we want it to be
            // indexed by 0
            var index = caret - 1;
            bool openBox = false;

            bool done = false;
            while (!done && index >= 0)
            {
                switch (Text[index])
                {
                    case ' ':
                    case '\n':
                        done = true;
                        break;

                    case '@':
                        openBox = true;
                        index -= 1;
                        break;

                    default:
                        // in this case the character before `@` is not an space so we should not open the mention
                        // box, since it could be an email or something like this.
                        if (openBox)
                        {
                            openBox = false;
                            done = true;
                        }
                        index -= 1;
                        break;
                }
            }

            if (openBox)
            {
                // in all cases we must increment the index, since if the `@` was found at the first
                // position in Text the index at this point will be -1, and if the `@` was found after
                // an empty space the index should point to the `@` which is the next character.
                await OpenMentionBox(index + 1);
                return;
            }
        }
        ResetMentions();
    }

    private async Task CheckKey(KeyboardEventArgs ev)
    {
        try
        {
            await UpdateCaretPosition();

            if (_textarea is null)
            {
                // TODO: handle this case
                return;
            }

            if (_showMentionBox)
            {

                // handle keys if mention box is opened
                switch (ev.Key)
                {
                    case "ArrowUp":
                        // handle previous suggestion
                        _selectedSuggestionIndex =
                            (int)_selectedSuggestionIndex == 0 ?
                            _suggestions!.Count - 1 :
                            (object)((int)_selectedSuggestionIndex - 1);

                        return;

                    case "ArrowDown":
                        // handle next suggestion
                        _selectedSuggestionIndex =
                            (int)_selectedSuggestionIndex < _suggestions!.Count - 1 ?
                            (int)_selectedSuggestionIndex + 1 :
                            (object)0;

                        return;

                    case "Enter":
                        await OnSelectedUser(_suggestions![(int)_selectedSuggestionIndex]);
                        return;

                    case "Escape":
                        ResetMentions();
                        return;
                }
            }

            DisposeTimer();

            await ShouldOpenMentionBox();

            if (_showMentionBox)
            {
                // only if the mention box is opened we reset/start the timer
                StartTimer();
            }
        }
        catch (JSException e)
        {
            await JS.InvokeVoidAsync("alert", e.Message);
        }
    }

    public void Dispose()
    {
        DisposeTimer();
        GC.SuppressFinalize(this);
    }
}
