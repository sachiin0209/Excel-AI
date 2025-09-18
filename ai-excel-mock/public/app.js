(async () => {
  const $ = id => document.getElementById(id);
  let interviewId = null;

  $('beginBtn').addEventListener('click', async () => {
    const name = $('name').value.trim();
    const email = $('email').value.trim();
    const phone = $('phone').value.trim();
    const jobTitle = $('jobTitle').value.trim();

    if (!name || !email || !jobTitle) {
      return alert('Please fill in all required fields (Name, Email, and Job Title).');
    }

    try {
      const response = await fetch('/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, email, phone, jobTitle })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      interviewId = data.interviewId;
      $('start').classList.add('hidden');
      $('interview').classList.remove('hidden');
      $('interview-progress').classList.remove('hidden');
      $('questionText').textContent = `Question ${data.questionNumber}/3: ${data.question}`;
      $('evaluation').classList.add('hidden');
      $('summary').classList.add('hidden');
      $('progress').textContent = `Question ${data.questionNumber} of 3`;
      $('progressFill').style.width = '33.33%';
    } catch (error) {
      alert('Error starting interview: ' + error.message);
    }
  });

  $('submitAnswerBtn').addEventListener('click', async () => {
    const answer = $('answerText').value.trim();
    if (!answer) return alert('Please enter an answer.');
    
    try {
      const response = await fetch('/answer', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ interviewId, answer })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.evaluation) {
        $('evaluation').classList.remove('hidden');
        $('evaluation').innerHTML = `
          <div class="evaluation-section">
            <h3>Evaluation (Score: ${data.evaluation.score}/10)</h3>
            <p>${data.evaluation.feedback}</p>
            <div class="strengths">
              <h4>Strengths:</h4>
              <ul>${data.evaluation.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
            <div class="improvements">
              <h4>Areas for Improvement:</h4>
              <ul>${data.evaluation.improvements.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
          </div>
        `;
      }

      if (data.isComplete) {
        // Hide interview section completely
        $('interview').classList.add('hidden');
        $('evaluation').classList.add('hidden');
        
        // Show summary section
        $('summary').classList.remove('hidden');
        
        // Update progress to complete
        $('progress').textContent = 'Complete';
        $('progressFill').style.width = '100%';
        
        // Create evaluation history HTML
        const evaluationsHtml = data.evaluations.map((evaluation, index) => `
          <div class="evaluation-history-item">
            <h4>Question ${index + 1}</h4>
            <div class="score">Score: ${evaluation.score}/10</div>
            <p>${evaluation.feedback}</p>
            <div class="strengths">
              <h5>Strengths:</h5>
              <ul>${evaluation.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
            <div class="improvements">
              <h5>Areas for Improvement:</h5>
              <ul>${evaluation.improvements.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
          </div>
        `).join('');

        const totalScore = data.evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) / data.evaluations.length;
        
        $('summary').innerHTML = `
          <div class="final-summary">
            <h3>Interview Complete - Final Results</h3>
            <div class="total-score">
              Total Score: ${totalScore.toFixed(1)}/10
            </div>
            <div class="evaluation-history">
              <h4>Evaluation History</h4>
              ${evaluationsHtml}
            </div>
            <div class="final-feedback">
              <h4>Overall Feedback</h4>
              <p>${data.finalEvaluation.text}</p>
              <div class="recommendations">
                <h4>Recommendations for Improvement:</h4>
                <ul>${data.finalEvaluation.improvements.map(i => `<li>${i}</li>`).join('')}</ul>
              </div>
            </div>
            <div style="text-align: center; margin-top: 2rem;">
              <button onclick="window.location.reload()" class="btn">Start New Interview</button>
            </div>
          </div>
        `;
      } else {
        $('questionText').textContent = `Question ${data.questionNumber}/3: ${data.nextQuestion}`;
        $('progress').textContent = `Question ${data.questionNumber} of 3`;
        $('progressFill').style.width = `${data.questionNumber * 33.33}%`;
        $('answerText').value = '';
        $('answerText').focus();
      }
    } catch (error) {
      alert('Error submitting answer: ' + error.message);
    }
  });
})();
