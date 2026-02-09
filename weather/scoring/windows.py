"""
Best-Windows Analyzer
=====================
Scans a 24-hour hourly forecast and finds the optimal time windows
for a given activity.
"""

from .engine import compute_score


def find_best_windows(hourly_data: list, activity, threshold: int = 60) -> list:
    """
    Parameters
    ----------
    hourly_data : list of dicts
        Each dict has 'hour' (str like '07:00') plus weather keys
        expected by compute_score().
    activity : ActivityType instance
    threshold : minimum score to consider a window viable

    Returns
    -------
    list of window dicts sorted by peak score (best first):
        [{'start': '07:00', 'end': '09:00', 'peak': 87, 'avg': 82}]
    """
    if not hourly_data:
        return []

    scored = []
    for h in hourly_data:
        result = compute_score(h, activity)
        scored.append({
            'hour': h.get('hour', '??'),
            'score': result['score'],
        })

    # Find contiguous blocks above threshold
    windows = []
    current = None

    for entry in scored:
        if entry['score'] >= threshold:
            if current is None:
                current = {
                    'start': entry['hour'],
                    'end': entry['hour'],
                    'peak': entry['score'],
                    'scores': [entry['score']],
                }
            else:
                current['end'] = entry['hour']
                current['peak'] = max(current['peak'], entry['score'])
                current['scores'].append(entry['score'])
        else:
            if current is not None:
                current['avg'] = round(
                    sum(current['scores']) / len(current['scores']), 1
                )
                del current['scores']
                windows.append(current)
                current = None

    if current is not None:
        current['avg'] = round(
            sum(current['scores']) / len(current['scores']), 1
        )
        del current['scores']
        windows.append(current)

    return sorted(windows, key=lambda w: w['peak'], reverse=True)
