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
  "2024-01-17": {
    date: "2024-01-17",
    questions: [
      {
        id: 1,
        question: "What is the value of 'true' && false in JavaScript?",
        options: ["true", "false", "undefined", "null"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which CSS property is used to change text color?",
        options: ["text-color", "color", "font-color", "foreground"],
        correctAnswer: 1,
      },
      {
        id: 3,
        question: "What is the result of 5 % 2 in JavaScript?",
        options: ["2", "1", "0", "3"],
        correctAnswer: 1,
      },
      {
        id: 4,
        question: "Which HTML tag is used to create an unordered list?",
        options: ["<ol>", "<ul>", "<li>", "<list>"],
        correctAnswer: 1,
      },
      {
        id: 5,
        question: "What does JSON stand for?",
        options: ["JavaScript Object Notation", "JavaScript Object Network", "Java Standard Object Notation", "JavaScript Ordered Number"],
        correctAnswer: 0,
      },
      {
        id: 6,
        question: "Which CSS property is used to set the background image?",
        options: ["background-image", "bg-image", "background-img", "image-background"],
        correctAnswer: 0,
      },
      {
        id: 7,
        question: "What is the correct way to access a property in JavaScript?",
        options: ["object.property", "object->property", "object.property()", "object.property:"],
        correctAnswer: 0,
      },
      {
        id: 8,
        question: "Which HTML element is used to define a table row?",
        options: ["<tr>", "<td>", "<th>", "<row>"],
        correctAnswer: 0,
      },
      {
        id: 9,
        question: "What is the output of 'hello'.repeat(2) in JavaScript?",
        options: ["hellohello", "hello hello", "hello2", "hellohello"],
        correctAnswer: 0,
      },
      {
        id: 10,
        question: "Which CSS property is used to set the font size?",
        options: ["font-size", "size", "font", "text-size"],
        correctAnswer: 0,
      },
    ],
  },
  "2024-01-18": {
    date: "2024-01-18",
    questions: [
      {
        id: 1,
        question: "What is the correct way to declare a constant in JavaScript?",
        options: ["const myVar", "constant myVar", "let myVar", "var myVar"],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Which HTML tag is used to create a button?",
        options: ["<button>", "<btn>", "<push>", "<click>"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "What is the result of '5' - 2 in JavaScript?",
        options: ["3", "5-2", "3", "Error"],
        correctAnswer: 0,
      },
      {
        id: 4,
        question: "Which CSS property is used to set the border radius?",
        options: ["border-radius", "border-round", "radius", "border-roundness"],
        correctAnswer: 0,
      },
      {
        id: 5,
        question: "What does SQL stand for?",
        options: ["Structured Query Language", "Simple Query Language", "Standard Query Language", "System Query Language"],
        correctAnswer: 0,
      },
      {
        id: 6,
        question: "Which HTML element is used to define a table header?",
        options: ["<th>", "<td>", "<head>", "<header>"],
        correctAnswer: 0,
      },
      {
        id: 7,
        question: "What is the output of '10' / 2 in JavaScript?",
        options: ["5", "10/2", "2", "Error"],
        correctAnswer: 0,
      },
      {
        id: 8,
        question: "Which CSS property is used to set the text alignment?",
        options: ["text-align", "align-text", "text-alignment", "align"],
        correctAnswer: 0,
      },
      {
        id: 9,
        question: "What is the correct way to create an object in JavaScript?",
        options: ["const obj = {key: value}", "const obj = {key: value}", "const obj = {key: value}", "const obj = {key: value}"],
        correctAnswer: 0,
      },
      {
        id: 10,
        question: "Which HTML tag is used to create a form?",
        options: ["<form>", "<input>", "<form>", "<form>"],
        correctAnswer: 0,
      },
    ],
  },
  "2024-01-19": {
    date: "2024-01-19",
    questions: [
      {
        id: 1,
        question: "What is the value of 'true' || false in JavaScript?",
        options: ["true", "false", "undefined", "null"],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Which CSS property is used to set the padding?",
        options: ["padding", "margin", "border", "spacing"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "What is the result of 3 * 4 in JavaScript?",
        options: ["7", "12", "15", "Error"],
        correctAnswer: 1,
      },
      {
        id: 4,
        question: "Which HTML tag is used to create an ordered list?",
        options: ["<ol>", "<ul>", "<li>", "<list>"],
        correctAnswer: 0,
      },
      {
        id: 5,
        question: "What does XML stand for?",
        options: ["eXtensible Markup Language", "eXtensible Machine Language", "eXtensible Meta Language", "eXtensible Main Language"],
        correctAnswer: 0,
      },
      {
        id: 6,
        question: "Which CSS property is used to set the margin?",
        options: ["margin", "padding", "border", "spacing"],
        correctAnswer: 0,
      },
      {
        id: 7,
        question: "What is the output of '10' * 2 in JavaScript?",
        options: ["20", "102", "12", "Error"],
        correctAnswer: 0,
      },
      {
        id: 8,
        question: "Which HTML element is used to define a table cell?",
        options: ["<td>", "<th>", "<cell>", "<div>"],
        correctAnswer: 0,
      },
      {
        id: 9,
        question: "What is the correct way to declare a function in JavaScript?",
        options: ["function myFunction() {}", "function myFunction: {}", "myFunction() {}", "myFunction: {}"],
        correctAnswer: 0,
      },
      {
        id: 10,
        question: "Which CSS property is used to set the font family?",
        options: ["font-family", "font", "font-style", "font-type"],
        correctAnswer: 0,
      },
    ],
  },
  "2024-01-20": {
    date: "2024-01-20",
    questions: [
      {
        id: 1,
        question: "What is the value of 'false' && true in JavaScript?",
        options: ["true", "false", "undefined", "null"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which CSS property is used to set the width?",
        options: ["width", "height", "size", "dimension"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "What is the result of 100 / 4 in JavaScript?",
        options: ["25", "40", "20", "Error"],
        correctAnswer: 0,
      },
      {
        id: 4,
        question: "Which HTML tag is used to create a paragraph?",
        options: ["<p>", "<div>", "<span>", "<paragraph>"],
        correctAnswer: 0,
      },
      {
        id: 5,
        question: "What does HTML stand for?",
        options: ["HyperText Markup Language", "HyperText Machine Language", "HyperText Multi Language", "HyperText Main Language"],
        correctAnswer: 0,
      },
      {
        id: 6,
        question: "Which CSS property is used to set the height?",
        options: ["height", "width", "size", "dimension"],
        correctAnswer: 0,
      },
      {
        id: 7,
        question: "What is the output of '5' + 5 in JavaScript?",
        options: ["10", "55", "5+5", "Error"],
        correctAnswer: 1,
      },
      {
        id: 8,
        question: "Which HTML element is used to define a table body?",
        options: ["<tbody>", "<thead>", "<tfoot>", "<table>"],
        correctAnswer: 0,
      },
      {
        id: 9,
        question: "What is the correct way to access an array element in JavaScript?",
        options: ["array[index]", "array[index]", "array[index]", "array[index]"],
        correctAnswer: 0,
      },
      {
        id: 10,
        question: "Which CSS property is used to set the font weight?",
        options: ["font-weight", "font", "font-style", "font-size"],
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
