const API_URL =
  "https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate";

const form = document.getElementById("estimate-form");
const statusDiv = document.getElementById("status");
const resultDiv = document.getElementById("result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  statusDiv.textContent = "Checking...";
  resultDiv.innerHTML = "";

  const payload = {
    month: document.getElementById("month").value,
    town: document.getElementById("town").value,
    flat_type: document.getElementById("flat_type").value,
    block: document.getElementById("block").value,
    street_name: document.getElementById("street_name").value,
    storey_range: document.getElementById("storey_range").value,
    floor_area_sqm: Number(
      document.getElementById("floor_area_sqm").value
    ),
    flat_model: document.getElementById("flat_model").value,
    lease_commence_date: Number(
      document.getElementById("lease_commence_date").value
    ),
    remaining_lease:
      document.getElementById("remaining_lease").value,
    asking_price: Number(
      document.getElementById("asking_price").value
    )
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Request failed"
      );
    }

    statusDiv.textContent = "Completed";

    displayResult(data);

  } catch (error) {
    statusDiv.textContent = "Error";
    resultDiv.textContent = error.message;
  }
});


function displayResult(data) {
  let html = "";

  html += `
    <h2>Result</h2>

    <p>
      Evidence sufficient:
      <strong>${data.evidence_sufficient}</strong>
    </p>

    <p>
      Candidate transactions:
      ${data.evidence.candidate_count}
    </p>

    <p>
      Top-5 average similarity:
      ${data.evidence.top5_avg_score.toFixed(2)}
    </p>
  `;

  if (data.evidence_sufficient) {
    html += `
      <p>
        Estimated price:
        <strong>
          $${data.estimated_price.toLocaleString(
            undefined,
            { maximumFractionDigits: 0 }
          )}
        </strong>
      </p>

      <p>
        Prediction interval:
        $${data.prediction_interval.lower.toLocaleString(
          undefined,
          { maximumFractionDigits: 0 }
        )}
        –
        $${data.prediction_interval.upper.toLocaleString(
          undefined,
          { maximumFractionDigits: 0 }
        )}
      </p>
    `;
  } else {
    html += `
      <p>
        Evidence is insufficient to provide
        a reliable price estimate.
      </p>
    `;
  }

  html += `
    <h3>Top Comparables</h3>
    <table border="1" cellpadding="6">
      <thead>
        <tr>
          <th>Month</th>
          <th>Block</th>
          <th>Street</th>
          <th>Storey</th>
          <th>Area</th>
          <th>Price</th>
          <th>Similarity</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const item of data.comparables) {
    html += `
      <tr>
        <td>${item.month}</td>
        <td>${item.block}</td>
        <td>${item.street_name}</td>
        <td>${item.storey_range}</td>
        <td>${item.floor_area_sqm}</td>
        <td>
          $${item.resale_price.toLocaleString()}
        </td>
        <td>
          ${item.comparable_score.toFixed(2)}
        </td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  resultDiv.innerHTML = html;
}