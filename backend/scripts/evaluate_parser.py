"""Parser accuracy on the synthetic corpus.

Usage:
    uv run python -m scripts.evaluate_parser --count 300 [--formats pdf,docx] [--show-failures 10]
"""

import argparse
import tempfile
import time
from collections import Counter, defaultdict
from pathlib import Path

from app.resume_pipeline.extract import DocumentExtractor
from app.resume_pipeline.ocr import create_ocr
from app.resume_pipeline.parsing.parser import RuleBasedParser
from tests.corpus.generator import TODAY, generate
from tests.corpus.scoring import aggregate, field_family, score


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=200)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--formats", default="")
    parser.add_argument("--show-failures", type=int, default=8)
    args = parser.parse_args()
    formats = [f for f in args.formats.split(",") if f]

    extractor = DocumentExtractor(ocr=create_ocr("tesseract", "eng"))
    scores, by_format, failures = [], defaultdict(list), Counter()
    examples: dict[str, list[tuple[int, str]]] = defaultdict(list)
    started = time.perf_counter()
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(args.count):
            seed = args.start + i
            fmt = formats[i % len(formats)] if formats else None
            sample = generate(seed, fmt, Path(tmp))
            try:
                document, _ = extractor.extract(sample.kind, sample.data)  # type: ignore[arg-type]
                data = RuleBasedParser(default_phone_region="US", today=TODAY).parse(document.lines)
            except Exception as exc:
                print(f"seed {seed} ({sample.style.fmt}) crashed: {exc}")
                continue
            sc = score(sample.truth, data)
            scores.append(sc)
            by_format[sample.style.fmt].append(sc)
            for name in sc.failures:
                failures[field_family(name)] += 1
                if len(examples[field_family(name)]) < args.show_failures:
                    examples[field_family(name)].append((seed, sample.style.fmt))

    print(f"\n{len(scores)} resumes in {time.perf_counter() - started:.0f}s\n")
    print(f"{'field':32} {'accuracy':>9}   n")
    for fam, (ok, n) in aggregate(scores).items():
        print(f"{fam:32} {ok / n:9.1%} {n:4}")
    print("\nper format (all checks):")
    for fmt, items in sorted(by_format.items()):
        agg = aggregate(items)
        ok = sum(v[0] for v in agg.values())
        n = sum(v[1] for v in agg.values())
        perfect = sum(1 for sc in items if not sc.failures)
        print(f"  {fmt:11} {ok / n:7.1%}   fully correct resumes: {perfect}/{len(items)}")
    if examples:
        print("\nfailing seeds (seed, format):")
        for fam, seeds in sorted(examples.items(), key=lambda kv: -failures[kv[0]]):
            print(f"  {fam:30} {failures[fam]:4}  {seeds}")


if __name__ == "__main__":
    main()
