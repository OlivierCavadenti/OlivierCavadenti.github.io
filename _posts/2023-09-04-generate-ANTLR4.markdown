---
layout: post
title:  "Build Interpreters with ANTLR4 and GPT"
date:   2023-09-03
categories: jekyll update
---

ANTLR4 is a fantastic tool to build interpreters. It is a parser generator that can generate parsers in many languages.
I use it a lot to build (silly) interpreters for my own languages like image manipulation language in SQL: [PicSQL](https://github.com/olcav/picsql).

In this article, how to connect LLM like GPT to ANTLR4 to build grammars and interpreters... in natural language!

# Code

Here we go...

{% highlight kotlin %}
@OptIn(BetaOpenAI::class)
suspend fun buildInterpreter(prompt: String, grammarFile: String) {
    val chatCompletionRequest = ChatCompletionRequest(
        model = ModelId("gpt-4"),
        messages = listOf(
            ChatMessage(
                ChatRole("user"),
                """
                Build a valid non-recursive ANTLR4 g4 grammar named $grammarFile
                given the description of the language "$prompt".
                Don't build a grammar with rules that are mutually left-recursive.
                Be sure to add labels and well defined rules.
                Only print the grammar, without any extra stuff.
                """
            )
        )
    )
    val openAI = OpenAI(token = "YOUR_TOKEN", timeout =  Timeout(socket = 20.minutes))
    val completion: ChatCompletion = openAI.chatCompletion(chatCompletionRequest)

    val answer = completion.choices.joinToString("") {
        it.message!!.content!!
    }

    val grammarParsed = extractAntlrGrammar(answer)

    File(grammarFile).writeText(grammarParsed)

    val grammar = Grammar(File(grammarFile).readText())
    grammar.name = grammarFile.substringBefore(".g4")
    grammar.tool.gen_visitor = true
    grammar.tool.gen_listener = true
    CodeGenPipeline(grammar).process()
}

fun extractAntlrGrammar(text: String): String {
    val grammar = "```antlr([\\s\\S]*?)```".toRegex().find(text)
    if (grammar != null) {
        return grammar.groupValues[1]
    }
    return text
}
{% endhighlight %}

If the first part of the code, we prompt GPT with a description of the language we want to parse.
It's important to give him the grammar file name, because it will be used to name the grammar and it necessary
to have a valid ANTLR4 grammar that can be compiled later.

Then, we extract the grammar from the answer of GPT. We use a regex to extract the grammar from the answer because
sometimes GPT return extra stuff that we don't want despite the fact that we ask him to only return the grammar...

Finally, we build the grammar with ANTLR4 toolkit and we generate the visitor and listener.

{% highlight kotlin %}
val grammar = Grammar(File(grammarFile).readText())
grammar.name = grammarFile.substringBefore(".g4")
grammar.tool.gen_visitor = true
grammar.tool.gen_listener = true
CodeGenPipeline(grammar).process()
{% endhighlight %}

That will generate Java classes for the visitor and listener (see [Examples](#examples)) that can be used in
your projects !

So you need to add the ANTLR4 dependency to your project:

{% highlight kotlin %}
implementation("org.antlr:antlr4:4.9.3")
{% endhighlight %}

# Examples

First, I build a grammar for a simple calculator:

{% highlight kotlin %}
suspend fun main(){
    buildInterpreter("a simple calculator", "Calculator.g4")
}
{% endhighlight %}

The generated grammar is:

{% highlight antlr %}
grammar Calculator;

// Parser Rules
start: expr EOF;

expr
: MINUS term
| term PLUS expr
| term MINUS expr
| term
;

term
: factor MULTIPLY term
| factor DIVIDE term
| factor
;

factor
: LPAR expr RPAR
| NUMBER
;

// Lexer Rules
MINUS       : '-';
PLUS        : '+';
MULTIPLY    : '*';
DIVIDE      : '/';
LPAR        : '(';
RPAR        : ')';
NUMBER      : [0-9]+ ('.' [0-9]+)?;

WS          : [ \t\n\r]+ -> skip ; // Skip spaces, tabs, line breaks
{% endhighlight %}

The grammar works !

![image tooltip here](/images/antlr4.png)

ANTLR4 build visitors and listeners in Java like you can see:

![image tooltip here](/images/file_generated.png)

The base visitor is:

{% highlight java %}
public class CalculatorBaseVisitor<T> extends org.antlr.v4.runtime.tree.AbstractParseTreeVisitor<T> implements CalculatorVisitor<T> {
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitStartRule(CalculatorParser.StartRuleContext ctx) { return visitChildren(ctx); }
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitExpression(CalculatorParser.ExpressionContext ctx) { return visitChildren(ctx); }
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitSub_exp(CalculatorParser.Sub_expContext ctx) { return visitChildren(ctx); }
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitMult_exp(CalculatorParser.Mult_expContext ctx) { return visitChildren(ctx); }
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitPow_exp(CalculatorParser.Pow_expContext ctx) { return visitChildren(ctx); }
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitDiv_exp(CalculatorParser.Div_expContext ctx) { return visitChildren(ctx); }
	/**
	 * {@inheritDoc}
	 *
	 * <p>The default implementation returns the result of calling
	 * {@link #visitChildren} on {@code ctx}.</p>
	 */
	@Override public T visitAtom(CalculatorParser.AtomContext ctx) { return visitChildren(ctx); }
}
{% endhighlight %}

# Go Further

A lot to do here !

Some ideas:

- Fix grammar errors
- Generate the code of the visitor and listener in Kotlin
- Expand the grammar with more rules
