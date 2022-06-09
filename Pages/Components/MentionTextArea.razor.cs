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

    private class Word
    {
        public string Text;
        public int Caret;
    }

    private List<Word>? _texts;

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

    private int _caretPosition = 0;
    private int _currentWordIndex = 0;

    private string CurrentWord
    {
        get
        {
            if (_texts is not null && _currentWordIndex < _texts.Count)
            {
                return _texts[_currentWordIndex].Text;
            }
            return "";
        }
    }

    private List<Profile>? _suggestions;
    private object SelectedSuggestionIndex { get; set; } = 0;

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
        _currentWordIndex = 0;
    }

    private void UpdateTexts(string? text)
    {
        if (text is not null)
        {
            var caret = 0;
            _texts = new();

            // FIXME: for some reason if I have an empty space followed by a new line
            // I'll have an additional string with length 0. It should not happen, I think
            // the problem is with the regex I'm using the split the text.
            string[] parts = Regex.Split(text, @"([.,;\s])");
            foreach (var part in parts)
            {
                if (part.Length > 0)
                {
                    _texts.Add(new() { Text = part, Caret = caret });
                }
                caret += part.Length;
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
                acc += txt.Text.Length;
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
            _currentWordIndex = CaretPositionToWordIndex(_caretPosition);
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
        if (!string.IsNullOrEmpty(CurrentWord))
        {
            _suggestions = await ProfileSvc.GetProfiles(CurrentWord[1..], MaxSuggestions);
            await InvokeAsync(StateHasChanged);
        }
    }

    public async Task OnSelectedUser(Profile user)
    {
        if (_texts is not null)
        {
            var username = "@" + user.Username!;
            var word = _texts[_currentWordIndex];

            _texts[_currentWordIndex] = new() { Text = username, Caret = word.Caret };

            var completionLength = username.Length - word.Text.Length;
            var cursor = word.Caret + username.Length;

            var text = "";
            foreach (var w in _texts)
            {
                text += w.Text;
            }

            await JS.InvokeVoidAsync("updateMentionBoxText", _textarea, text, cursor);
            ResetMentions();

            // XXX: as we are adding text from the suggestion we should recalculate all words caret index
            foreach (var w in _texts.Skip(_currentWordIndex + 1))
            {
                w.Caret += completionLength;
            }

            // update the caret position after the suggestion been added
            _caretPosition = cursor;
        }
    }

    private void ResetMentions()
    {
        if (_showMentionBox)
        {
            DisposeTimer();
            _showMentionBox = false;
            _suggestions?.Clear();
            _suggestions = null;
            SelectedSuggestionIndex = 0;
        }
    }

    private async Task OpenMentionBox()
    {
        _mentionBoxWidth = await JS.InvokeAsync<int>("getElementWidthById", "_mentionBoxContainer");
        _showMentionBox = true;
        _suggestions = null;
    }

    private async Task ShouldOpenMentionBox()
    {
        if (!string.IsNullOrEmpty(CurrentWord) && CurrentWord[0] == '@' && !_showMentionBox)
        {
            await OpenMentionBox();
            return;
        }
        ResetMentions();
    }

    private async Task CheckKey(KeyboardEventArgs ev)
    {
        try
        {
            if (_textarea is not null)
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
                                SelectedSuggestionIndex = _suggestions!.Count - 1;
                            }
                            return;

                        case "ArrowDown":
                            // handle next suggestion
                            SelectedSuggestionIndex = (int)SelectedSuggestionIndex + 1;
                            if ((int)SelectedSuggestionIndex >= _suggestions!.Count)
                            {
                                SelectedSuggestionIndex = 0;
                            }
                            return;

                        case "Enter":
                            await OnSelectedUser(_suggestions![(int)SelectedSuggestionIndex]);
                            return;

                        case "Escape":
                            ResetMentions();
                            return;
                    }
                }

                await UpdateCaretPosition();
                DisposeTimer();

                await ShouldOpenMentionBox();
                if (_showMentionBox)
                {
                    // only if the mention box is opened we reset/start the timer
                    StartTimer();
                }
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
