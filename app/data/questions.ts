export interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface DailyQuestions {
  date: string;
  questions: Question[];
}

export const questionsByDate: Record<string, DailyQuestions> = {
  "2024-01-15": {
    date: "2024-01-15",
    questions: [
      {
        id: 1,
        question: "What does HTML stand for?",
        options: ["Hyper Text Markup Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language", "Hyper Tool Multi Language"],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Which CSS property controls text size?",
        options: ["font-size", "text-size", "font-size-adjust", "text-style"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "What is the correct way to declare a JavaScript variable?",
        options: ["variable myVar;", "v myVar;", "var myVar;", "variable myVar;"],
        correctAnswer: 2,
      },
      {
        id: 4,
        question: "Which HTML tag is used to define an internal style sheet?",
        options: ["<script>", "<style>", "<css>", "<link>"],
        correctAnswer: 1,
      },
      {
        id: 5,
        question: "What does DOM stand for?",
        options: ["Document Object Model", "Data Object Model", "Digital Ordinance Model", "Document Orientation Model"],
        correctAnswer: 0,
      },
      {
        id: 6,
        question: "Which is NOT a valid HTML element?",
        options: ["<div>", "<span>", "<paragraph>", "<br>"],
        correctAnswer: 2,
      },
      {
        id: 7,
        question: "What is the correct syntax for referring to an external script called 'app.js'?",
        options: ["<script href='app.js'>", "<script name='app.js'>", "<script src='app.js'>", "<script file='app.js'>"],
        correctAnswer: 2,
      },
      {
        id: 8,
        question: "Which HTML attribute is used to define inline styles?",
        options: ["class", "style", "css", "design"],
        correctAnswer: 1,
      },
      {
        id: 9,
        question: "What is the correct way to create a function in JavaScript?",
        options: ["function myFunction()", "function: myFunction()", "myFunction()", "function myFunction:"],
        correctAnswer: 0,
      },
      {
        id: 10,
        question: "Which HTML element is used to insert a line break?",
        options: ["<lb>", "<break>", "<br>", "<newline>"],
        correctAnswer: 2,
      },
    ],
  },
  "2024-01-16": {
    date: "2024-01-16",
    questions: [
      {
        id: 1,
        question: "What is the output of '2' + 2 in JavaScript?",
        options: ["4", "22", "NaN", "Error"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which CSS property is used to change the background color?",
        options: ["color", "bgcolor", "background-color", "background-image"],
        correctAnswer: 2,
      },
      {
        id: 3,
        question: "What does API stand for?",
        options: ["Application Programming Interface", "Advanced Programming Interface", "Application Process Interface", "All Programming Interface"],
        correctAnswer: 0,
      },
      {
        id: 4,
        question: "Which HTML tag is used to create a hyperlink?",
        options: ["<link>", "<a>", "<href>", "<hyperlink>"],
        correctAnswer: 1,
      },
      {
        id: 5,
        question: "What is the correct way to comment in JavaScript?",
        options: ["// comment", "/* comment */", "<!-- comment -->", "Both A and B"],
        correctAnswer: 3,
      },
      {
        id: 6,
        question: "Which CSS property controls the visibility of an element?",
        options: ["display", "visibility", "show", "hide"],
        correctAnswer: 0,
      },
      {
        id: 7,
        question: "What is the correct syntax for a JavaScript array?",
        options: ["myArray = (1, 2, 3);", "myArray = [1, 2, 3];", "myArray = {1, 2, 3};", "myArray = <1, 2, 3>"],
        correctAnswer: 1,
      },
      {
        id: 8,
        question: "Which HTML element is used to define the title of a document?",
        options: ["<title>", "<head>", "<header>", "<h1>"],
        correctAnswer: 0,
      },
      {
        id: 9,
        question: "What does CSS stand for?",
        options: ["Creative Style Sheets", "Cascading Style Sheets", "Computer Style Sheets", "Colorful Style Sheets"],
        correctAnswer: 1,
      },
      {
        id: 10,
        question: "Which JavaScript method is used to convert a string to uppercase?",
        options: ["toUpperCase()", "toUppercase()", "upper()", "toUpperCaseString()"],
        correctAnswer: 0,
      },
    ],
  },
};

export function getTodayQuestions(): DailyQuestions | null {
  const today = new Date().toISOString().split('T')[0];
  return questionsByDate[today] || null;
}

export function getAvailableDates(): string[] {
  return Object.keys(questionsByDate).sort();
}
