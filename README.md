# Blazor Mentions

https://user-images.githubusercontent.com/31552590/173620006-d1f24986-641a-45a1-8d79-02c0975ebf54.mp4

**This repository is an experiment in creating a component to manage completions, 
this is not ready to use**

This is an attempt to implement a powerfull yet simple component to handle mentions 
and other completions, it's implemented using [MudBlazor](https://mudblazor.com/) 
and a content editable.

- [ ] Reduce the javascript size
- [ ] Support others characters to open the popover
- [x] Get the editor content as a string
- [ ] Get the editor content as a tree of tokens
- [ ] Show a tooltip when the mouse is over a `mention`
- [ ] Enable a list of regex to highlight matching words

## Quick Start

```sh
git clone https://github.com/drocha87/blazorServerMentions
cd blazorServerMentions
dotnet watch run
```
