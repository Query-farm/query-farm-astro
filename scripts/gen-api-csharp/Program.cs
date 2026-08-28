using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

if (args.Length != 2)
{
    Console.Error.WriteLine("usage: gen-api-csharp <vgi-csharp checkout> <output directory>");
    return 2;
}

var checkout = Path.GetFullPath(args[0]);
var sourceRoot = Path.Combine(checkout, "src", "QueryFarm.Vgi");
var outputRoot = Path.GetFullPath(args[1]);
if (!Directory.Exists(sourceRoot))
{
    Console.Error.WriteLine($"QueryFarm.Vgi sources not found: {sourceRoot}");
    return 2;
}

var groups = new[]
{
    new Group("worker", "Worker & serving", "The worker builder, registration surface, and supported process transports.", ["QueryFarm.Vgi"]),
    new Group("scalar", "Scalar functions", "Vectorized one-row-to-one-value functions and reflection-driven ScalarFn dispatch.", ["QueryFarm.Vgi.Scalar"]),
    new Group("table", "Table functions", "Set-returning producers, bind/init parameters, and table argument declarations.", ["QueryFarm.Vgi.Table"]),
    new Group("table-in-out", "Table-in-out functions", "Streaming relation transforms that process Arrow record batches.", ["QueryFarm.Vgi.TableInOut"]),
    new Group("buffering", "Buffering functions", "Sink, combine, and source phases with durable cross-process state.", ["QueryFarm.Vgi.Buffering"]),
    new Group("aggregate", "Aggregate functions", "Per-group state update, combine, and finalization.", ["QueryFarm.Vgi.Aggregate"]),
    new Group("catalog", "Catalogs", "Schemas, tables, views, macros, constraints, and scan metadata.", ["QueryFarm.Vgi.Catalog"]),
    new Group("attributes-types", "Attributes & Arrow types", "Compute parameter annotations and Arrow type helpers.", ["QueryFarm.Vgi.Attributes", "QueryFarm.Vgi.Types"]),
    new Group("protocol", "Protocol", "The VGI application-level request, result, and metadata contracts.", ["QueryFarm.Vgi.Protocol"]),
};

var byNamespace = groups.SelectMany(group => group.Namespaces.Select(ns => (ns, group)))
    .ToDictionary(pair => pair.ns, pair => pair.group, StringComparer.Ordinal);
var types = new List<ApiType>();
var unknownNamespaces = new SortedSet<string>(StringComparer.Ordinal);

foreach (var file in Directory.EnumerateFiles(sourceRoot, "*.cs", SearchOption.AllDirectories).Order())
{
    var text = File.ReadAllText(file);
    var root = CSharpSyntaxTree.ParseText(text, path: file).GetCompilationUnitRoot();
    foreach (var declaration in root.DescendantNodes().OfType<MemberDeclarationSyntax>())
    {
        if (declaration.Parent is not BaseNamespaceDeclarationSyntax && declaration.Parent is not CompilationUnitSyntax)
        {
            continue;
        }

        if (!IsPublicType(declaration))
        {
            continue;
        }

        var ns = declaration.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault()?.Name.ToString() ?? "";
        if (ns.StartsWith("QueryFarm.Vgi.Internal", StringComparison.Ordinal))
        {
            continue;
        }

        if (!byNamespace.TryGetValue(ns, out var group))
        {
            unknownNamespaces.Add(ns.Length == 0 ? "<global>" : ns);
            continue;
        }

        var relative = Path.GetRelativePath(checkout, file).Replace(Path.DirectorySeparatorChar, '/');
        var line = declaration.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
        types.Add(new ApiType(
            NameOf(declaration), KindOf(declaration), ns, group.Slug,
            SignatureOf(declaration), DocsOf(declaration),
            $"https://github.com/Query-farm/vgi-csharp/blob/main/{relative}#L{line}",
            MembersOf(declaration)));
    }
}

if (unknownNamespaces.Count > 0)
{
    Console.Error.WriteLine("Unmapped public namespaces: " + string.Join(", ", unknownNamespaces));
    return 1;
}

Directory.CreateDirectory(outputRoot);
var expected = new HashSet<string>(groups.Select(group => group.Slug + ".mdx").Append("index.mdx"), StringComparer.Ordinal);
foreach (var stale in Directory.EnumerateFiles(outputRoot, "*.mdx").Where(path => !expected.Contains(Path.GetFileName(path))))
{
    File.Delete(stale);
}

var rendered = new HashSet<string>(StringComparer.Ordinal);
foreach (var group in groups)
{
    var pageTypes = types.Where(type => type.Group == group.Slug)
        .OrderBy(type => type.Name, StringComparer.Ordinal).ToArray();
    var output = new StringBuilder();
    output.AppendLine("---");
    output.AppendLine($"title: {Yaml(group.Title)}");
    output.AppendLine($"description: {Yaml(group.Blurb)}");
    output.AppendLine("---");
    output.AppendLine();
    output.AppendLine("<div class=\"api-module-doc\">");
    output.AppendLine();
    output.AppendLine("<p class=\"api-module-doc__label\">On this page</p>");
    output.AppendLine();
    output.AppendLine(group.Blurb);
    output.AppendLine();
    output.AppendLine("</div>");

    foreach (var type in pageTypes)
    {
        rendered.Add(type.Namespace + "." + type.Name);
        output.AppendLine();
        output.AppendLine("<div class=\"api-member\">");
        output.AppendLine();
        output.AppendLine($"<a id=\"{WebUtility.HtmlEncode(type.Name)}\"></a>");
        output.AppendLine($"## <span class=\"api-icon api-icon--class\"></span><span class=\"api-kind-tag api-kind-tag--class\">{type.Kind}</span> `{type.Name}`");
        output.AppendLine();
        output.AppendLine($"<a class=\"api-source\" href=\"{type.Source}\" target=\"_blank\" rel=\"noopener\">source</a>");
        output.AppendLine();
        output.AppendLine($"<pre class=\"api-sig\"><code>{Html(type.Signature)}</code></pre>");
        if (!string.IsNullOrWhiteSpace(type.Docs))
        {
            output.AppendLine();
            output.AppendLine("<p class=\"api-section\">Description</p>");
            output.AppendLine();
            output.AppendLine($"<p>{Html(type.Docs)}</p>");
        }

        if (type.Members.Count > 0)
        {
            output.AppendLine();
            output.AppendLine("<p class=\"api-section\">Public members</p>");
            output.AppendLine();
            output.AppendLine("<div class=\"api-members\">");
            foreach (var member in type.Members)
            {
                output.AppendLine();
                output.AppendLine("<div class=\"api-member\">");
                output.AppendLine();
                output.AppendLine($"<pre class=\"api-sig\"><code>{Html(member.Signature)}</code></pre>");
                if (!string.IsNullOrWhiteSpace(member.Docs)) output.AppendLine($"<p>{Html(member.Docs)}</p>");
                output.AppendLine();
                output.AppendLine("</div>");
            }
            output.AppendLine();
            output.AppendLine("</div>");
        }

        output.AppendLine();
        output.AppendLine("</div>");
    }

    File.WriteAllText(Path.Combine(outputRoot, group.Slug + ".mdx"), output.ToString());
    Console.WriteLine($"generated {group.Slug}.mdx ({pageTypes.Length} public types)");
}

var collected = types.Select(type => type.Namespace + "." + type.Name).ToHashSet(StringComparer.Ordinal);
if (!collected.SetEquals(rendered))
{
    Console.Error.WriteLine("API completeness audit failed: collected and rendered public types differ");
    return 1;
}

Console.WriteLine($"C# API completeness: {rendered.Count} public types rendered across {groups.Length} pages");
return 0;

static bool IsPublicType(MemberDeclarationSyntax declaration) => declaration switch
{
    BaseTypeDeclarationSyntax type => type.Modifiers.Any(SyntaxKind.PublicKeyword),
    DelegateDeclarationSyntax type => type.Modifiers.Any(SyntaxKind.PublicKeyword),
    _ => false,
};

static string NameOf(MemberDeclarationSyntax declaration) => declaration switch
{
    BaseTypeDeclarationSyntax type => type.Identifier.Text,
    DelegateDeclarationSyntax type => type.Identifier.Text,
    _ => throw new InvalidOperationException(),
};

static string KindOf(MemberDeclarationSyntax declaration) => declaration switch
{
    InterfaceDeclarationSyntax => "interface",
    EnumDeclarationSyntax => "enum",
    RecordDeclarationSyntax => "record",
    StructDeclarationSyntax => "struct",
    DelegateDeclarationSyntax => "delegate",
    _ => "class",
};

static string SignatureOf(MemberDeclarationSyntax declaration)
{
    var text = declaration switch
    {
        TypeDeclarationSyntax type => type.WithMembers(default).WithOpenBraceToken(default).WithCloseBraceToken(default).ToString(),
        EnumDeclarationSyntax type => type.WithMembers(default).WithOpenBraceToken(default).WithCloseBraceToken(default).ToString(),
        DelegateDeclarationSyntax type => type.ToString(),
        _ => declaration.ToString(),
    };
    return Normalize(text.Trim().TrimEnd(';'));
}

static IReadOnlyList<ApiMember> MembersOf(MemberDeclarationSyntax declaration)
{
    if (declaration is not TypeDeclarationSyntax type) return [];
    var members = new List<ApiMember>();
    foreach (var member in type.Members.Where(IsPublicMember))
    {
        var signature = member switch
        {
            MethodDeclarationSyntax method => method.WithBody(null).WithExpressionBody(null)
                .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)).ToString(),
            ConstructorDeclarationSyntax ctor => ctor.WithBody(null).WithExpressionBody(null)
                .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)).ToString(),
            OperatorDeclarationSyntax op => op.WithBody(null).WithExpressionBody(null)
                .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)).ToString(),
            ConversionOperatorDeclarationSyntax op => op.WithBody(null).WithExpressionBody(null)
                .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)).ToString(),
            PropertyDeclarationSyntax property => PropertySignature(property),
            IndexerDeclarationSyntax indexer => Normalize(indexer.WithExpressionBody(null).ToString()),
            EventDeclarationSyntax evt => Normalize(evt.ToString()),
            _ => Normalize(member.ToString()),
        };
        members.Add(new ApiMember(Normalize(signature), DocsOf(member)));
    }
    return members.OrderBy(member => member.Signature, StringComparer.Ordinal).Take(80).ToArray();
}

static bool IsPublicMember(MemberDeclarationSyntax member) => member.Modifiers().Any(SyntaxKind.PublicKeyword)
    && member is not BaseTypeDeclarationSyntax;

static string PropertySignature(PropertyDeclarationSyntax property)
{
    var accessors = property.AccessorList?.Accessors.Select(accessor => accessor.Keyword.Text + ";") ?? [];
    var prefix = string.Join(" ", property.Modifiers.Select(modifier => modifier.Text));
    return $"{prefix} {property.Type} {property.Identifier}{(accessors.Any() ? " { " + string.Join(" ", accessors) + " }" : ";")}";
}

static string DocsOf(SyntaxNode node)
{
    var raw = string.Join("\n", node.GetLeadingTrivia()
        .Where(trivia => trivia.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia)
            || trivia.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia))
        .Select(trivia => trivia.ToFullString()));
    if (raw.Length == 0) return "";
    raw = Regex.Replace(raw, @"^\s*///\s?", "", RegexOptions.Multiline);
    raw = Regex.Replace(raw, @"^\s*/\*\*|\*/\s*$|^\s*\*\s?", "", RegexOptions.Multiline);
    raw = Regex.Replace(raw, "<see\\s+(?:cref|langword)=\\\"([^\\\"]+)\\\"\\s*/>", "$1");
    raw = Regex.Replace(raw, "<paramref\\s+name=\\\"([^\\\"]+)\\\"\\s*/>", "$1");
    raw = Regex.Replace(raw, @"</?(?:summary|remarks|para|c)>", " ");
    raw = Regex.Replace(raw, @"<[^>]+>", " ");
    return Normalize(WebUtility.HtmlDecode(raw));
}

static string Normalize(string value) => Regex.Replace(value, @"\s+", " ").Trim();
static string Html(string value) => WebUtility.HtmlEncode(value).Replace("{", "&#123;").Replace("}", "&#125;");
static string Yaml(string value) => "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";

sealed record Group(string Slug, string Title, string Blurb, string[] Namespaces);
sealed record ApiType(string Name, string Kind, string Namespace, string Group, string Signature, string Docs, string Source, IReadOnlyList<ApiMember> Members);
sealed record ApiMember(string Signature, string Docs);

static class SyntaxExtensions
{
    public static SyntaxTokenList Modifiers(this MemberDeclarationSyntax member) => member switch
    {
        BaseFieldDeclarationSyntax field => field.Modifiers,
        BaseMethodDeclarationSyntax method => method.Modifiers,
        BasePropertyDeclarationSyntax property => property.Modifiers,
        _ => default,
    };
}
