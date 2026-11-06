const API_URL =
  "https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate";

const form = document.getElementById("estimate-form");
const statusDiv = document.getElementById("status");
const resultDiv = document.getElementById("result");

const monthInput = document.getElementById("month");
const leaseYearInput = document.getElementById("lease_commence_date");
const remainingYearsInput = document.getElementById("remaining_lease_years");
const remainingMonthsInput = document.getElementById("remaining_lease_months");
const remainingLeaseInput = document.getElementById("remaining_lease");
const estimateLeaseButton = document.getElementById("estimate-lease-button");

let lastSubmittedPayload = null;


function formatCurrency(value) {
  return Number(value).toLocaleString("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0
  });
}


function updateRemainingLeaseHiddenField() {
  const years = Number(remainingYearsInput.value || 0);
  const months = Number(remainingMonthsInput.value || 0);

  remainingLeaseInput.value =
    `${years} years ${String(months).padStart(2, "0")} months`;
}


function estimateRemainingLease() {
  const monthValue = monthInput.value;
  const leaseYear = Number(leaseYearInput.value);

  if (!monthValue || !leaseYear) {
    return;
  }

  const [targetYear, targetMonth] = monthValue.split("-").map(Number);

  // Approximation because only the commencement year is available.
  const elapsedMonths =
    (targetYear - leaseYear) * 12 + (targetMonth - 1);

  const totalLeaseMonths = 99 * 12;

  const remainingTotalMonths = Math.max(
    0,
    Math.min(
      totalLeaseMonths,
      totalLeaseMonths - elapsedMonths
    )
  );

  const years = Math.floor(remainingTotalMonths / 12);
  const months = remainingTotalMonths % 12;

  remainingYearsInput.value = years;
  remainingMonthsInput.value = months;

  updateRemainingLeaseHiddenField();
}


estimateLeaseButton.addEventListener(
  "click",
  estimateRemainingLease
);

remainingYearsInput.addEventListener(
  "input",
  updateRemainingLeaseHiddenField
);

remainingMonthsInput.addEventListener(
  "input",
  updateRemainingLeaseHiddenField
);


form.addEventListener("submit", async (event) => {
  event.preventDefault();

  updateRemainingLeaseHiddenField();

  statusDiv.className = "status loading";
  statusDiv.textContent =
    "Analysing comparable transactions...";

  resultDiv.innerHTML = "";

  const payload = {
    month: document.getElementById("month").value,

    town: document.getElementById("town").value,

    flat_type:
      document.getElementById("flat_type").value,

    block:
      document
        .getElementById("block")
        .value
        .trim()
        .toUpperCase(),

    street_name:
      document
        .getElementById("street_name")
        .value
        .trim()
        .toUpperCase(),

    storey_range:
      document.getElementById("storey_range").value,

    floor_area_sqm:
      Number(
        document.getElementById("floor_area_sqm").value
      ),

    flat_model:
      document.getElementById("flat_model").value,

    lease_commence_date:
      Number(
        document.getElementById(
          "lease_commence_date"
        ).value
      ),

    remaining_lease:
      remainingLeaseInput.value,

    asking_price:
      Number(
        document.getElementById("asking_price").value
      )
  };

  lastSubmittedPayload = payload;

  try {
    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(payload)
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The service returned an unexpected response."
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        "Unable to complete the analysis. Please check the entered details."
      );
    }

    statusDiv.className = "status success";
    statusDiv.textContent = "Analysis completed";

    displayResult(data);

  } catch (error) {
    statusDiv.className = "status error";
    statusDiv.textContent =
      "Unable to complete analysis";

    resultDiv.innerHTML = `
      <div class="card error-card">
        <h2>Something went wrong</h2>

        <p>
          ${escapeHtml(error.message)}
        </p>

        <p class="small-note">
          Check the entered details and try again.
        </p>
      </div>
    `;
  }
});


function buildInterpretation(data, askingPrice) {

  if (!data.evidence_sufficient) {
    return {
      title: "Insufficient comparable evidence",

      text:
        "The available recent transactions are not sufficiently strong " +
        "to support a reliable price estimate for this flat. " +
        "This does not mean that the asking price is unreasonable."
    };
  }

  const estimate =
    Number(data.estimated_price);

  const lower =
    Number(data.prediction_interval.lower);

  const upper =
    Number(data.prediction_interval.upper);

  const difference =
    askingPrice - estimate;


  if (askingPrice < lower) {
    return {
      title:
        "Asking price is below the estimated range",

      text:
        `The asking price is ` +
        `${formatCurrency(Math.abs(difference))} ` +
        `below the model estimate and is below the lower end ` +
        `of the estimated range. This may warrant further ` +
        `investigation, but it does not by itself prove that ` +
        `the flat is underpriced.`
    };
  }


  if (askingPrice > upper) {
    return {
      title:
        "Asking price is above the estimated range",

      text:
        `The asking price is ` +
        `${formatCurrency(Math.abs(difference))} ` +
        `above the model estimate and exceeds the upper end ` +
        `of the estimated range. Unit-specific attributes not ` +
        `captured in the data may still explain part of the difference.`
    };
  }


  if (difference > 0) {
    return {
      title:
        "Asking price is within the estimated range",

      text:
        `The asking price is ` +
        `${formatCurrency(difference)} ` +
        `above the model estimate, but it remains within the ` +
        `estimated range. This should not be interpreted as proof ` +
        `that the flat is overpriced.`
    };
  }


  if (difference < 0) {
    return {
      title:
        "Asking price is within the estimated range",

      text:
        `The asking price is ` +
        `${formatCurrency(Math.abs(difference))} ` +
        `below the model estimate and remains within the estimated ` +
        `range. This should not be interpreted as proof that the flat ` +
        `is underpriced.`
    };
  }


  return {
    title:
      "Asking price is close to the model estimate",

    text:
      "The asking price is approximately equal to the model estimate " +
      "and falls within the estimated range."
  };
}


function displayResult(data) {

  const evidence =
    data.evidence || {};

  const askingPrice =
    Number(
      lastSubmittedPayload?.asking_price || 0
    );

  const interpretation =
    buildInterpretation(
      data,
      askingPrice
    );


  const candidateCount =
    evidence.candidate_count !== undefined
      ? evidence.candidate_count
      : "—";


  const averageScore =
    evidence.top5_avg_score !== undefined &&
    evidence.top5_avg_score !== null
      ? Number(
          evidence.top5_avg_score
        ).toFixed(1)
      : "—";


  let html = `
    <section class="results-section">

      <div class="section-heading result-heading">

        <p class="eyebrow">
          Your analysis
        </p>

        <h2>
          ${escapeHtml(
            interpretation.title
          )}
        </h2>

        <p>
          ${escapeHtml(
            interpretation.text
          )}
        </p>

      </div>


      <div class="metric-grid">

        <article class="metric-card">

          <span class="metric-label">
            Comparable evidence
          </span>

          <strong class="metric-value">
            ${
              data.evidence_sufficient
                ? "Sufficient"
                : "Insufficient"
            }
          </strong>

          <span class="metric-note">
            ${candidateCount}
            candidate transaction${
              candidateCount === 1
                ? ""
                : "s"
            }
          </span>

        </article>


        <article class="metric-card">

          <span class="metric-label">
            Asking price
          </span>

          <strong class="metric-value">
            ${formatCurrency(
              askingPrice
            )}
          </strong>

          <span class="metric-note">
            Entered asking price
          </span>

        </article>
  `;


  if (data.evidence_sufficient) {

    const estimate =
      Number(data.estimated_price);

    const lower =
      Number(
        data.prediction_interval.lower
      );

    const upper =
      Number(
        data.prediction_interval.upper
      );

    const difference =
      askingPrice - estimate;

    const differencePct =
      estimate !== 0
        ? (difference / estimate) * 100
        : 0;


    html += `
        <article class="metric-card">

          <span class="metric-label">
            Estimated price
          </span>

          <strong class="metric-value">
            ${formatCurrency(
              estimate
            )}
          </strong>

          <span class="metric-note">
            Model estimate
          </span>

        </article>


        <article class="metric-card">

          <span class="metric-label">
            Difference from estimate
          </span>

          <strong class="metric-value">
            ${
              difference >= 0
                ? "+"
                : "-"
            }${formatCurrency(
              Math.abs(difference)
            )}
          </strong>

          <span class="metric-note">
            ${
              difference >= 0
                ? "+"
                : ""
            }${differencePct.toFixed(1)}%
          </span>

        </article>

      </div>


      <div class="card range-card">

        <div>

          <span class="metric-label">
            Estimated price range
          </span>

          <strong class="range-value">
            ${formatCurrency(lower)}
            –
            ${formatCurrency(upper)}
          </strong>

        </div>


        <p>
          This interval reflects uncertainty in the
          estimate. It is not a guaranteed selling-price
          range for an individual flat.
        </p>

      </div>
    `;

  } else {

    html += `
      </div>

      <div class="card range-card">

        <p>
          No price estimate is shown because the
          comparable-evidence rule was not satisfied.
          You can still review the available transactions below.
        </p>

      </div>
    `;
  }


  html += `
      <div class="evidence-summary">

        <div>

          <span class="metric-label">
            Candidate transactions
          </span>

          <strong>
            ${candidateCount}
          </strong>

        </div>


        <div>

          <span class="metric-label">
            Top-5 average similarity
          </span>

          <strong>
            ${averageScore}${
              averageScore === "—"
                ? ""
                : " / 100"
            }
          </strong>

        </div>

      </div>


      ${buildComparablesTable(
        data.comparables || []
      )}


      <div class="card interpretation-card">

        <h3>
          How to interpret this result
        </h3>

        <ul>

          <li>
            The estimate is based on historical
            transactions for similar flats.
          </li>

          <li>
            A higher similarity score indicates a closer
            match under the comparable-ranking rules.
          </li>

          <li>
            The uncertainty range should be considered
            together with the individual comparable
            transactions.
          </li>

          <li>
            Renovation, condition, orientation and other
            unit-specific factors are not captured by the model.
          </li>

          <li>
            A difference from the estimate is not, by itself,
            evidence of overpricing or underpricing.
          </li>

        </ul>

      </div>

    </section>
  `;


  resultDiv.innerHTML = html;
}


function buildComparablesTable(comparables) {

  if (!comparables.length) {

    return `
      <div class="card comparables-card">

        <h3>
          Similar recent transactions
        </h3>

        <p>
          No comparable transactions were returned
          for this request.
        </p>

      </div>
    `;
  }


  const rows =
    comparables
      .map(
        (item) => `
          <tr>

            <td>
              ${escapeHtml(item.month)}
            </td>

            <td>
              ${escapeHtml(item.block)}
            </td>

            <td>
              ${escapeHtml(
                item.street_name
              )}
            </td>

            <td>
              ${escapeHtml(
                item.storey_range
              )}
            </td>

            <td>
              ${escapeHtml(
                item.floor_area_sqm
              )} sqm
            </td>

            <td>
              ${formatCurrency(
                item.resale_price
              )}
            </td>

            <td>

              <span class="score-pill">

                ${Number(
                  item.comparable_score
                ).toFixed(1)}
                / 100

              </span>

            </td>

          </tr>
        `
      )
      .join("");


  return `
    <div class="card comparables-card">

      <div class="card-heading-row">

        <div>

          <p class="eyebrow">
            Transaction evidence
          </p>

          <h3>
            Similar recent transactions
          </h3>

        </div>


        <p class="small-note">
          Ranked using the project's
          comparable-scoring rules.
        </p>

      </div>


      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>
                Month
              </th>

              <th>
                Block
              </th>

              <th>
                Street
              </th>

              <th>
                Storey
              </th>

              <th>
                Area
              </th>

              <th>
                Resale price
              </th>

              <th>
                Similarity
              </th>

            </tr>

          </thead>


          <tbody>
            ${rows}
          </tbody>

        </table>

      </div>

    </div>
  `;
}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}