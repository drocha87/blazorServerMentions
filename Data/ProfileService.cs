using System.Text.RegularExpressions;
using blazorServerMentions.Components;

namespace blazorServerMentions.Data;

public class ProfileService
{
    private static readonly List<Profile> Profiles = new()
    {
        // data auto generated by https://www.mockaroo.com/
        new Profile { Name="Caspar", Username="cmclucky0", Avatar = "https://robohash.org/eumplaceatipsa.png?size=50x50&set=set1" },
        new Profile { Name="Jackie", Username="jcrosgrove1", Avatar = "https://robohash.org/praesentiumvoluptatemaut.png?size=50x50&set=set1" },
        new Profile { Name="Gerick", Username="gdicarli2", Avatar = "https://robohash.org/iustoerrorincidunt.png?size=50x50&set=set1" },
        new Profile { Name="Amelia", Username="ahauck3", Avatar = "https://robohash.org/numquamvelsint.png?size=50x50&set=set1" },
        new Profile { Name="Clemens", Username="cmottram4", Avatar = "https://robohash.org/quiavoluptatemsit.png?size=50x50&set=set1" },
        new Profile { Name="Barth", Username="bmintram5", Avatar = "https://robohash.org/consequaturfacilisaccusamus.png?size=50x50&set=set1" },
        new Profile { Name="Cynthea", Username="cyankishin6", Avatar = "https://robohash.org/occaecatienimat.png?size=50x50&set=set1" },
        new Profile { Name="Charity", Username="cbygraves7", Avatar = "https://robohash.org/nullaquiblanditiis.png?size=50x50&set=set1" },
        new Profile { Name="Corey", Username="cmuckleston8", Avatar = "https://robohash.org/etrerumiure.png?size=50x50&set=set1" },
        new Profile { Name="Ernestine", Username="ebunford9", Avatar = "https://robohash.org/nisireprehenderitdeleniti.png?size=50x50&set=set1" },
        new Profile { Name="Lind", Username="ltresslera", Avatar = "https://robohash.org/existeodit.png?size=50x50&set=set1" },
        new Profile { Name="Gill", Username="gdugmoreb", Avatar = "https://robohash.org/praesentiumvelmolestiae.png?size=50x50&set=set1" },
        new Profile { Name="Hannis", Username="hwipperc", Avatar = "https://robohash.org/nonnisiculpa.png?size=50x50&set=set1" },
        new Profile { Name="Giraud", Username="gkalinked", Avatar = "https://robohash.org/porroadipisciaperiam.png?size=50x50&set=set1" },
        new Profile { Name="Wrennie", Username="wphillpote", Avatar = "https://robohash.org/nisidebitissit.png?size=50x50&set=set1" },
        new Profile { Name="Aviva", Username="abirneyf", Avatar = "https://robohash.org/veritatisveroratione.png?size=50x50&set=set1" },
        new Profile { Name="Dagmar", Username="dhueling", Avatar = "https://robohash.org/aspernaturullamnihil.png?size=50x50&set=set1" },
        new Profile { Name="Talya", Username="tkemmonsh", Avatar = "https://robohash.org/velrepellatet.png?size=50x50&set=set1" },
        new Profile { Name="Rosabella", Username="rborleyi", Avatar = "https://robohash.org/pariaturvoluptateullam.png?size=50x50&set=set1" },
        new Profile { Name="Bruno", Username="bgurwoodj", Avatar = "https://robohash.org/voluptatemsedharum.png?size=50x50&set=set1" },
        new Profile { Name="Beatriz", Username="blewzeyk", Avatar = "https://robohash.org/harumdeseruntaspernatur.png?size=50x50&set=set1" },
        new Profile { Name="Arlena", Username="alehrianl", Avatar = "https://robohash.org/commodilaudantiumcum.png?size=50x50&set=set1" },
        new Profile { Name="Patricio", Username="praymondm", Avatar = "https://robohash.org/doloremqueatqueaperiam.png?size=50x50&set=set1" },
        new Profile { Name="Ira", Username="idiken", Avatar = "https://robohash.org/istequammagni.png?size=50x50&set=set1" },
        new Profile { Name="Zorana", Username="zreiso", Avatar = "https://robohash.org/repellatvoluptatemvel.png?size=50x50&set=set1" },
        new Profile { Name="Albina", Username="amoulinp", Avatar = "https://robohash.org/excepturiimpeditin.png?size=50x50&set=set1" },
        new Profile { Name="Gustaf", Username="greadingq", Avatar = "https://robohash.org/remetcorporis.png?size=50x50&set=set1" },
        new Profile { Name="Nelly", Username="nfloatr", Avatar = "https://robohash.org/sitlaudantiumnesciunt.png?size=50x50&set=set1" },
        new Profile { Name="Isidora", Username="iturneuxs", Avatar = "https://robohash.org/remessenisi.png?size=50x50&set=set1" },
        new Profile { Name="Teena", Username="tthundert", Avatar = "https://robohash.org/minimaaliaserror.png?size=50x50&set=set1" },
        new Profile { Name="Evvy", Username="eswyneu", Avatar = "https://robohash.org/etquamfacere.png?size=50x50&set=set1" },
        new Profile { Name="Innis", Username="ihuntev", Avatar = "https://robohash.org/quasenimest.png?size=50x50&set=set1" },
        new Profile { Name="Emili", Username="egadiew", Avatar = "https://robohash.org/delenitisapienteeos.png?size=50x50&set=set1" },
        new Profile { Name="Lorie", Username="lonnx", Avatar = "https://robohash.org/liberovoluptatumesse.png?size=50x50&set=set1" },
        new Profile { Name="Janenna", Username="jsharplessy", Avatar = "https://robohash.org/perspiciatisatvoluptas.png?size=50x50&set=set1" },
        new Profile { Name="Celle", Username="cburtwistlez", Avatar = "https://robohash.org/commodiconsequaturnecessitatibus.png?size=50x50&set=set1" },
        new Profile { Name="Desmund", Username="dmcfaell10", Avatar = "https://robohash.org/ametisteharum.png?size=50x50&set=set1" },
        new Profile { Name="Bastian", Username="bbernlin11", Avatar = "https://robohash.org/quisquamdoloribusin.png?size=50x50&set=set1" },
        new Profile { Name="Rosalind", Username="rlead12", Avatar = "https://robohash.org/doloribuspossimusiusto.png?size=50x50&set=set1" },
        new Profile { Name="Kizzee", Username="kfeasby13", Avatar = "https://robohash.org/sitremmaiores.png?size=50x50&set=set1" },
        new Profile { Name="Dilly", Username="dklimshuk14", Avatar = "https://robohash.org/dolorearumet.png?size=50x50&set=set1" },
        new Profile { Name="Emylee", Username="eyarn15", Avatar = "https://robohash.org/quononad.png?size=50x50&set=set1" },
        new Profile { Name="Tiphany", Username="tspadotto16", Avatar = "https://robohash.org/quamharumquia.png?size=50x50&set=set1" },
        new Profile { Name="Dell", Username="dread17", Avatar = "https://robohash.org/quiquisquamsaepe.png?size=50x50&set=set1" },
        new Profile { Name="Ardella", Username="adelleschi18", Avatar = "https://robohash.org/amagninihil.png?size=50x50&set=set1" },
        new Profile { Name="Lonnie", Username="loloshin19", Avatar = "https://robohash.org/sequinesciuntfugit.png?size=50x50&set=set1" },
        new Profile { Name="Corissa", Username="cshapiro1a", Avatar = "https://robohash.org/voluptasconsequaturodit.png?size=50x50&set=set1" },
        new Profile { Name="Tamarah", Username="tflippen1b", Avatar = "https://robohash.org/sedetet.png?size=50x50&set=set1" },
        new Profile { Name="Jervis", Username="jblasgen1c", Avatar = "https://robohash.org/quietsoluta.png?size=50x50&set=set1" },
        new Profile { Name="Lindon", Username="lsheffield1d", Avatar = "https://robohash.org/suscipitsolutaquod.png?size=50x50&set=set1" },
        new Profile { Name="Dawna", Username="dkunes1e", Avatar = "https://robohash.org/etexcepturiin.png?size=50x50&set=set1" },
        new Profile { Name="Mic", Username="meadmeads1f", Avatar = "https://robohash.org/nisiullamquisquam.png?size=50x50&set=set1" },
        new Profile { Name="Rheta", Username="rmainwaring1g", Avatar = "https://robohash.org/remsolutanisi.png?size=50x50&set=set1" },
        new Profile { Name="Ginni", Username="gorgee1h", Avatar = "https://robohash.org/aadipisciporro.png?size=50x50&set=set1" },
        new Profile { Name="Esdras", Username="efloris1i", Avatar = "https://robohash.org/etducimusid.png?size=50x50&set=set1" },
        new Profile { Name="Shepherd", Username="sgoudard1j", Avatar = "https://robohash.org/repellatlaboresuscipit.png?size=50x50&set=set1" },
        new Profile { Name="Zacharie", Username="zholwell1k", Avatar = "https://robohash.org/totamquodsunt.png?size=50x50&set=set1" },
        new Profile { Name="Layne", Username="lmehaffey1l", Avatar = "https://robohash.org/autsedfacilis.png?size=50x50&set=set1" },
        new Profile { Name="Dorothy", Username="dgreder1m", Avatar = "https://robohash.org/autnesciuntquam.png?size=50x50&set=set1" },
        new Profile { Name="Selestina", Username="scourtier1n", Avatar = "https://robohash.org/natusexplicabomollitia.png?size=50x50&set=set1" },
        new Profile { Name="Teddie", Username="tkenny1o", Avatar = "https://robohash.org/illumeossint.png?size=50x50&set=set1" },
        new Profile { Name="Melloney", Username="mellwood1p", Avatar = "https://robohash.org/odioaccusantiumdolores.png?size=50x50&set=set1" },
        new Profile { Name="Aryn", Username="amcmeyler1q", Avatar = "https://robohash.org/aututtempore.png?size=50x50&set=set1" },
        new Profile { Name="Maddy", Username="mcolpus1r", Avatar = "https://robohash.org/eavoluptatumitaque.png?size=50x50&set=set1" },
        new Profile { Name="Conny", Username="camos1s", Avatar = "https://robohash.org/sintestvero.png?size=50x50&set=set1" },
        new Profile { Name="Gianina", Username="gstorek1t", Avatar = "https://robohash.org/illumeaqueest.png?size=50x50&set=set1" },
        new Profile { Name="Sonnie", Username="sdiver1u", Avatar = "https://robohash.org/abquasut.png?size=50x50&set=set1" },
        new Profile { Name="Roderic", Username="rlindop1v", Avatar = "https://robohash.org/pariaturveroquos.png?size=50x50&set=set1" },
        new Profile { Name="Harlan", Username="hlorne1w", Avatar = "https://robohash.org/aperiamoditcum.png?size=50x50&set=set1" },
        new Profile { Name="Desmund", Username="dbone1x", Avatar = "https://robohash.org/numquamdoloresdolorem.png?size=50x50&set=set1" },
        new Profile { Name="Genovera", Username="gjakubovsky1y", Avatar = "https://robohash.org/aliquidetiste.png?size=50x50&set=set1" },
        new Profile { Name="Irv", Username="isilverston1z", Avatar = "https://robohash.org/voluptatemdoloresnatus.png?size=50x50&set=set1" },
    };

    public class ProfileMentionDTO : IMention
    {
        public string Text { get; set; } = null!;
        public string Value { get; set; } = null!;
        public string Description { get; set; } = null!;
        public string? Avatar { get; set; }
    }

    public Task<List<ProfileMentionDTO>> GetProfilesAsMentions(string query, int limit = 5)
    {
        string pattern = query ?? @"^(?!\s*$).+";
        Regex rg = new(pattern, RegexOptions.IgnoreCase);

        return Task.FromResult(
            Profiles.Where(x => rg.IsMatch(x.Username))
                .Take(limit).ToList().ConvertAll(
                    p => new ProfileMentionDTO
                    {
                        Text = p.Name,
                        Value = p.Username,
                        Description = p.Username,
                        Avatar = p.Avatar,
                    }
                )
            );
    }
}
