---
layout: post
title:  "Return Custom Kotlin Objects from OpenAI GPT Raw Output"
date:   2023-09-03
categories: jekyll update
---

# Code

This function is the principal function that will be used to call the OpenAI API. 
It will take a prompt which need to describe what we want to output.

{% highlight kotlin %}
@OptIn(BetaOpenAI::class)
suspend inline fun  <reified T : Any> askWithOutput(prompt: String): T {
    val describeConstructor = if(T::class.java.isArray) {
        describeConstructor(T::class.java.componentType.kotlin)
    } else {
        describeConstructor(T::class)
    }
    val chatCompletionRequest = ChatCompletionRequest(
        model = ModelId("gpt-4"),
        messages = listOf(
            ChatMessage(
                ChatRole("user"),
                prompt
            ),
            ChatMessage(
                ChatRole("user"),
                """
                Please provide a response only in a JSON format (example: { 'key': 'value', ... } ) that can be parsed into 
                an object of type $describeConstructor.
                Don't output anything else.
                 If you want to output multiple objects, please wrap them in a array like: [ {...}, {...}, ... ]"
                """
            )
        )
    )

    val openAI = OpenAI(token = "YOUR_TOKEN", timeout =  Timeout(socket = 20.minutes) )
    val completion: ChatCompletion = openAI.chatCompletion(chatCompletionRequest)

    val answer = completion.choices.joinToString("") {
        it.message!!.content!!
    }

    if(T::class.java == String::class.java) {
        return answer as T
    }
    var instance = createInstanceFromJson(T::class.java, answer)
    if(instance is List<*>) {
        instance = instance[0] as T
    }
    return instance
}
{% endhighlight %}

We construct a prompt from our generic type T with this part:

{% highlight kotlin %}
val describeConstructor = if(T::class.java.isArray) {
    describeConstructor(T::class.java.componentType.kotlin)
} else {
    describeConstructor(T::class)
}
{% endhighlight %}

The describeConstructor function will return a string that describe the constructor of our generic type T.

{% highlight kotlin %}
fun <T : Any> describeConstructor(kClass: KClass<T>): String {
    val constructors = kClass.constructors
    val constructor = constructors.first()
    val params = constructor.parameters.joinToString(", ") { param: KParameter ->
        "${param.name}: ${param.type}"
    }
    return "${kClass.simpleName}($params)"
}
{% endhighlight %}

This message will be used to ask the user to provide a response only in a JSON format that can be parsed into an object of type T.
It's quite important to carefully construct the prompt because you need a valid JSON format to be able to parse it into an object.

{% highlight kotlin %}
ChatMessage(
    ChatRole("user"),
    """
        Please provide a response only in a JSON format (example: { 'key': 'value', ... } ) that can be parsed into
        an object of type $describeConstructor.
        Don't output anything else.
        If you want to output multiple objects, please wrap them in a array like: [ {...}, {...}, ... ]"
    """
)
{% endhighlight %}

The last part take the answer from the API and parse it into an object of type T.

{% highlight kotlin %}
var instance = createInstanceFromJson(T::class.java, answer)
if(instance is List<*>) {
    instance = instance[0] as T
}
return instance
{% endhighlight %}

The createInstanceFromJson function is a simple function that use the Jackson library to parse the JSON into an object of type T.

{% highlight kotlin %}
fun <T> createInstanceFromJson(clazz: Class<T>, answer: String): T {
    val mapper = jacksonObjectMapper()
    return mapper.readValue(answer, clazz)
}
{% endhighlight %}

# Examples

Let's take a simple example with a Circle class.

{% highlight kotlin %}
class Circle(val radius: Int){
    fun area(): Double {
        return Math.PI * radius * radius
    }
}
{% endhighlight %}

We can now call the askWithOutput function to create a circle of radius 5 and print the area of the circle.

{% highlight kotlin %}
askWithOutput<Circle>("Create a circle of radius 5")
    .let {
        println("area of circle " + it.area())
}
{% endhighlight %}

That will print: 

{% highlight kotlin %}
// area of circle 78.53981633974483
{% endhighlight %}

Given a Book class:

{% highlight kotlin %}
data class Book(val title: String, val author: String, val year: Int)
{% endhighlight %}

We can now call the askWithOutput function to create an array of books and print the title, author and year of all books.

{% highlight kotlin %}
askWithOutput<Array<Book>>("Suggest me a list of SciFi books")
    .forEach {
        println("Book: " + it.title + " by " + it.author + " in " + it.year)
}
{% endhighlight %}

That will print:

{% highlight kotlin %}
/**
Book: Dune by Frank Herbert in 1965
Book: 1984 by George Orwell in 1949
Book: Brave New World by Aldous Huxley in 1932
Book: The War of the Worlds by H.G. Wells in 1898
Book: Ender's Game by Orson Scott Card in 1985
Book: The Time Machine by H.G. Wells in 1895
Book: A Wrinkle in Time by Madeleine L'Engle in 1962
Book: Frankenstein by Mary Shelley in 1818
Book: The Hunger Games by Suzanne Collins in 2008
Book: Fahrenheit 451 by Ray Bradbury in 1953
Book: Starship Troopers by Robert A. Heinlein in 1959
Book: The Left Hand of Darkness by Ursula K. Le Guin in 1969
Book: Snow Crash by Neal Stephenson in 1992
Book: A Canticle for Leibowitz by Walter M. Miller Jr. in 1960
Book: Neuromancer by William Gibson in 1984
*/
{% endhighlight %}
