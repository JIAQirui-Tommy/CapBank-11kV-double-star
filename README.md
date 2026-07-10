# Double Star Capacitor Bank Unbalance Optimizer

A browser-based tool for calculating and reducing neutral unbalance current in an 11 kV double-star capacitor bank.

Live app: https://jiaqirui-tommy.github.io/CapBank-11kV-double-star/

## What It Does

- Models a double-star capacitor bank with 18 capacitors.
- Each star has three branches: Red, Yellow, and Blue.
- Each branch contains three capacitors.
- Capacitor labels follow the pattern `AR1`, `AR2`, `AY1`, `AB1`, `BR1`, `BY1`, `BB1`, etc.
- Calculates the neutral unbalance current using the engineering formula from the original project.
- Searches for capacitor swap recommendations to reduce unbalance current.
- Allows the user to choose a fixed number of swap pairs or use Auto mode.
- Keeps recommendations practical by limiting searches to 4 swap pairs and avoiding same-value swaps.
- Highlights applied swaps with different colors.
- Provides a downloadable CSV template for measured capacitance entry.
- Loads capacitor values from CSV instead of manual entry.
- Exports the recommended swap record as a CSV file that can be opened in Excel.

## Default Settings

- Line voltage: `11 kV`
- Frequency: `50 Hz`
- Nominal capacitance: `22 μF`
- Displayed unbalance current unit: `mA`

If the original engineering input uses `11300 V`, set the line voltage in the app to `11.3 kV`.

## Calculation Logic

The app first sums the capacitance of each branch:

```text
AR, AY, AB = Star 1 Red, Yellow, Blue branch totals
BR, BY, BB = Star 2 Red, Yellow, Blue branch totals
X = AR + AY + AB + BR + BY + BB
```

Then it calculates:

```text
S1 = BR * (AY - AB)
S2 = AR * (BB - BY)
S3 = AY * BB - AB * BY
S4 = AR * (BY + BB)
S5 = BR * (AY + AB)
```

The balance term is:

```text
bal = sqrt((S1 + S2 + 2S3)^2 + 3(S4 - S5)^2)
```

The neutral unbalance current is calculated as:

```text
I_unbalance = 0.001 * V * 2πf * bal / (2X)
```

Where:

- `V` is the line voltage in volts.
- `f` is the frequency in Hz.
- Branch capacitances are entered in `μF`.
- The app displays the result in `mA`.
- Main results are displayed to `0.00 mA`.
- Auto mode checks up to 4 swap pairs and stops at the smallest swap count whose displayed current rounds to `0.00 mA`.

## Swap Optimization Logic

The optimizer tries capacitor swaps and keeps the combinations that produce the lowest calculated unbalance current.

For the selected number of swap pairs:

1. It generates possible capacitor pair swaps.
2. It prevents the same capacitor position from being reused in the same recommendation.
3. It skips swaps where the two capacitance values are effectively the same.
4. It evaluates each candidate layout using the same unbalance-current formula.
5. It keeps the best layouts at each depth using the selected search width.
6. It recommends the practical lowest result, preferring fewer pairs unless another pair improves the displayed result by at least `0.01 mA`.

In `Auto` mode, the optimizer starts from the smallest swap count and stops as soon as the displayed result rounds to `0.00 mA`. If that target is not reached, it returns the practical lowest result found within 4 swap pairs.

The `Search width` setting controls how many candidate layouts are retained during the search:

- `Fast`: fewer candidates, quicker result.
- `Balanced`: default.
- `Deep`: more candidates, slower but broader search.

## Exported CSV

After running `Optimize`, click `Export CSV` to download the swap record.

The CSV includes:

- Created time
- Line voltage
- Frequency
- Nominal capacitance
- Selected swap-pair count
- Before and after unbalance current in `mA`
- Improvement percentage
- Number of capacitors moved
- Each recommended swap pair, including capacitor ID, original location, target location, and capacitance

## Loading CSV

Click `Template` to download a blank CSV template, fill the measured capacitance values, then click `Load CSV` to import it.

Supported formats:

```text
Cap Unit,Value (in uF)
AR1,24.40
AR2,25.30
AR3,24.60
AY1,25.20
...
```

or 18 numeric values in the same order as the on-screen layout:

```text
24.40,25.30,24.60,25.20,24.10,24.20,23.00,24.20,24.90,
24.30,24.30,23.00,23.50,24.50,22.90,24.30,23.90,21.70
```

## How To Use

1. Open the live app.
2. Click `Template` to download the CSV template, or enter values manually.
3. Fill the measured capacitance values and use `Load CSV` to import them.
4. Select up to 4 swap pairs, or leave it on `Auto`.
5. Select the search width.
6. Click `Optimize`.
7. Review the recommended swaps.
8. Click `Apply` to update the on-screen layout.
9. Click `Export CSV` to save the swap record.

## Files

- `index.html`: page structure
- `styles.css`: visual styling
- `app.js`: calculation, optimization, highlighting, and CSV export logic
