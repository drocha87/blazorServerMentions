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

    [Parameter] public string? Text { get; set; }
    [Parameter] public string? Placeholder { get; set; }
    [Parameter] public int DebounceTimer { get; set; } = 500;
    [Parameter] public int MaxSuggestions { get; set; } = 5;

    // [Parameter] public EventCallback<string> TextChanged { get; set; }

    private MudTextField<string>? _mentionBox;
    private bool _showMentionBox = false;
    private int? _mentionBoxWidth;

    private int _startCaretPosition = 0;

    private string? _query;
    private List<Profile>? _suggestions;
    private object _selectedSuggestionIndex = 0;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await JS.InvokeVoidAsync("initializeMentionBox", _mentionBox!.InputReference.ElementReference);
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
        if (Text is not null && _query is not null)
        {
            // FIXME: I feel that I can improve this piece of code
            var first = Text[.._startCaretPosition];
            var second = Text[(_startCaretPosition + 1)..];

            var index = second.IndexOf(' ');
            second = index > 0 ? second[index..] : "";

            var text = $"{first}@{user.Username}{second}";

            // update cursor position
            var cursor = first.Length + 1 + user.Username!.Length;

            var reference = _mentionBox!.InputReference.ElementReference;
            await JS.InvokeVoidAsync("updateMentionBoxText", reference, text, cursor);

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
        var reference = _mentionBox!.InputReference.ElementReference;
        var caret = await JS.InvokeAsync<int>("getElementCaretPosition", reference);

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
            if (_mentionBox is null)
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
