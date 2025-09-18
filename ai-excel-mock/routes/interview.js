const express = require('express');
const router = express.Router();
const { getInterviewsCollection } = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ObjectId } = require('mongodb');

// Initialize Gemini API with proper configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
    }
});

if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in env');

// Fallback questions in case API fails
const fallbackQuestions = {
    "Financial Analyst": [
        "Explain how you would use VLOOKUP and INDEX-MATCH to reconcile financial data from multiple sheets.",
        "How would you create a dynamic dashboard for monthly financial reporting using pivot tables?",
        "Describe your approach to creating a budget variance analysis template in Excel."
    ],
    "Data Analyst": [
        "How would you clean and deduplicate a large dataset using Excel functions?",
        "Explain your process for creating a dynamic dashboard with slicers and pivot tables.",
        "Describe how you would use Power Query to automate data transformation tasks."
    ],
    "default": [
        "Explain how you would use Excel to analyze and visualize data trends.",
        "Describe your experience with pivot tables and VLOOKUP functions.",
        "How would you automate repetitive tasks in Excel using macros or VBA?"
    ]
};

// Cache for responses
const responseCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function generateQuestion(jobTitle, questionNumber) {
    // Adjust questionNumber to 0-based index for array access
    const questionIndex = questionNumber - 1;
    
    try {
        const prompt = {
            contents: [{
                parts: [{
                    text: `Create a challenging Excel-related interview question for a ${jobTitle} position. 
                    The question should be specific to how ${jobTitle}s might use Excel in their work.
                    This is question number ${questionNumber} out of 3.
                    Format the response as a single question without any additional text.
                    Make sure the question is practical and specific to Excel functionality.`
                }]
            }]
        };

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const generatedQuestion = response.text().trim();
            
            if (generatedQuestion && generatedQuestion.length > 10) {
                return generatedQuestion;
            }
            throw new Error('Generated question too short or empty');
        } catch (apiError) {
            console.warn('Gemini API Error:', apiError);
            // Fall back to predefined questions
            throw apiError; // Let the outer catch handle it
        }
    } catch (error) {
        console.log('Falling back to predefined questions...');
        // Use fallback questions based on job title
        const jobCategory = jobTitle.toLowerCase();
        let questionBank;
        
        if (jobCategory.includes('financial') || jobCategory.includes('finance')) {
            questionBank = fallbackQuestions["Financial Analyst"];
        } else if (jobCategory.includes('data') || jobCategory.includes('analytics')) {
            questionBank = fallbackQuestions["Data Analyst"];
        } else {
            questionBank = fallbackQuestions["default"];
        }
        
        return questionBank[questionIndex % questionBank.length];
    }
}

async function evaluateAnswer(question, answer, jobTitle) {
    try {
        const prompt = {
            contents: [{
                parts: [{
                    text: `As an expert Excel interviewer, evaluate this answer for a ${jobTitle} position.
                    
                    Question: ${question}
                    Answer: ${answer}
                    
                    Evaluate and return ONLY a JSON object in this exact format:
                    {
                        "score": <number 0-10>,
                        "feedback": "<one sentence evaluation>",
                        "strengths": ["<strength1>", "<strength2>"],
                        "improvements": ["<improvement1>", "<improvement2>"]
                    }`
                }]
            }]
        };

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        
        try {
            // First try direct JSON parse
            const evaluation = JSON.parse(text);
            // Validate required fields
            if (typeof evaluation.score === 'number' && 
                typeof evaluation.feedback === 'string' &&
                Array.isArray(evaluation.strengths) &&
                Array.isArray(evaluation.improvements)) {
                return evaluation;
            }
            throw new Error('Invalid evaluation format');
        } catch (jsonError) {
            // If direct parse fails, try to extract JSON from text
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const extractedJson = JSON.parse(jsonMatch[0]);
                if (typeof extractedJson.score === 'number') {
                    return extractedJson;
                }
            }
            throw jsonError;
        }
    } catch (error) {
        console.warn('Evaluation error:', error);
        // Return a context-aware default evaluation
        const defaultEvaluation = {
            score: 5,
            feedback: `Answer received for question about ${question.substring(0, 50)}...`,
            strengths: [
                "Attempted to answer the question",
                answer.includes('=') ? "Used Excel formulas in explanation" : "Provided an explanation"
            ],
            improvements: [
                "Add more specific Excel function examples",
                "Include step-by-step implementation details",
                "Provide practical use cases or scenarios"
            ]
        };
        
        // Adjust score based on answer content
        if (answer.toLowerCase().includes('vlookup') || 
            answer.toLowerCase().includes('pivot') || 
            answer.toLowerCase().includes('macro')) {
            defaultEvaluation.score = 6;
            defaultEvaluation.strengths.push("Mentioned advanced Excel features");
        }
        
        return defaultEvaluation;
    }
}

// Start Interview
router.post('/start', async (req, res) => {
  try {
    const { name, email, phone, jobTitle } = req.body;
    if (!name || !email || !jobTitle) {
      return res.status(400).json({ error: 'Name, email, and job title are required' });
    }

    const question = await generateQuestion(jobTitle, 1);
    
    // Store in MongoDB
    const collection = await getInterviewsCollection();
    const interview = {
      name,
      email,
      phone: phone || null,
      jobTitle,
      startTime: new Date(),
      currentQuestion: 1,
      questions: [{ question, answer: null, evaluation: null }],
      status: 'in-progress',
      completedAt: null,
      questions: [{ question, answer: null, evaluation: null }],
      status: 'in-progress',
      completedAt: null
    };
    
    const result = await collection.insertOne(interview);
    
    res.json({
      interviewId: result.insertedId,
      question,
      questionNumber: 1
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// Submit Answer
router.post('/answer', async (req, res) => {
  try {
    const { interviewId, answer } = req.body;
    if (!interviewId || !answer) {
      return res.status(400).json({ error: 'Interview ID and answer are required' });
    }
    
    const collection = await getInterviewsCollection();
    const interview = await collection.findOne({ _id: new ObjectId(interviewId) });
    
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const currentQuestionIndex = interview.currentQuestion - 1;
    const currentQuestion = interview.questions[currentQuestionIndex];
    
    // Evaluate the answer
    const evaluation = await evaluateAnswer(currentQuestion.question, answer, interview.jobTitle);
    
    // Update the current question with answer and evaluation
    interview.questions[currentQuestionIndex] = {
      ...currentQuestion,
      answer,
      evaluation
    };

    // Check if we need to generate the next question or finish
    if (interview.currentQuestion < 3) {
      // Generate next question
      const nextQuestion = await generateQuestion(interview.jobTitle, interview.currentQuestion + 1);
      interview.questions.push({ question: nextQuestion, answer: null, evaluation: null });
      interview.currentQuestion += 1;

      // Update MongoDB
      await collection.updateOne(
        { _id: new ObjectId(interviewId) },
        { $set: {
          questions: interview.questions,
          currentQuestion: interview.currentQuestion
        }}
      );

      res.json({
        evaluation,
        nextQuestion,
        questionNumber: interview.currentQuestion,
        isComplete: false
      });
    } else {
      // Interview is complete - calculate final results
      const scores = interview.questions.map(q => q.evaluation.score);
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      
      const finalEvaluation = {
        text: `Interview completed with an average score of ${avgScore}/10. ` +
              `The candidate demonstrated ${avgScore >= 7 ? 'strong' : avgScore >= 5 ? 'adequate' : 'limited'} Excel proficiency. ` +
              `${evaluation.feedback}`,
        score: avgScore,
        improvements: evaluation.improvements
      };

      // Update MongoDB
      await collection.updateOne(
        { _id: new ObjectId(interviewId) },
        { 
          $set: {
            status: 'completed',
            finalEvaluation
          }
        }
      );

      // Prepare all evaluations for the response
      const evaluations = interview.questions
        .filter(q => q.evaluation)  // Only include answered questions
        .map(q => q.evaluation);    // Extract just the evaluations

      res.json({
        evaluation,
        isComplete: true,
        finalEvaluation,
        evaluations
      });
    }
  } catch (error) {
    console.error('Error processing answer:', error);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

module.exports = router;