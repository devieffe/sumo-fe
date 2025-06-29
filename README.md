# sumo-fe

## Person subject summary react/next.js component  

An AI-powered web application built with **Next.js 15**, **OpenAI**, and **SerpAPI** that generates concise 200-word biographies of real people based on live search results — with built-in IP-based rate limiting.

## ✨ Features

- 🔍 **Live web search**: Uses [SerpAPI](https://serpapi.com/) to gather top links for the query.
- 🤖 **Smart summarization**: Uses OpenAI’s GPT model to analyze and summarize the most relevant subject.
- 🧠 **Name disambiguation**: If the name refers to multiple individuals, the app selects one based on most common parameters.
- 🧱 **Rate limiting**: Restricts usage to a few requests per session.
- ⚡️ **Next.js 15 App router** with API routes and `app/` directory.
- 🧼 Fully type-safe and ESLint-compliant (`@typescript-eslint/no-explicit-any` safe).

## 🛠 Tech Stack

| Technology    | Purpose                               |
|---------------|----------------------------------------|
| **Next.js 15**| Full-stack React framework             |
| **OpenAI API**| Generates summaries from scraped links |
| **SerpAPI**   | Fetches top web results for a query    |
| **TypeScript**| Type safety across app and backend     |
| **TailwindCSS**| Styling for UI                        |


## 🚀 Live Demo

sumo-name.vercel.app

