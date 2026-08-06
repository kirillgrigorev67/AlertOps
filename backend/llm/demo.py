import random
from typing import Any, Dict, List, Optional
from .base import LLMProvider


DEMO_DIAGNOSES = [
    """**High CPU Usage Detected**

Probable cause: A process is consuming excessive CPU resources, likely due to a runaway application or insufficient resource limits.

Recommended actions:
1. Identify the top CPU-consuming processes using `top` or `htop`
2. Check for recent code deployments that might have introduced inefficient algorithms
3. Consider scaling horizontally or vertically if this is a recurring pattern
4. Review and optimize database queries if applicable

Severity: Medium - Monitor closely if this persists.""",

    """**Memory Pressure Alert**

Probable cause: Application memory leak or insufficient memory allocation for the workload.

Recommended actions:
1. Check memory usage per process with `ps aux --sort=-%mem`
2. Restart the affected service if memory leak is confirmed
3. Increase memory limits or add swap space as temporary relief
4. Profile the application to identify memory leaks

Severity: High - Address within 1 hour to prevent OOM kills.""",

    """**Disk Space Critical**

Probable cause: Log files growing uncontrollably or large temporary files not being cleaned up.

Recommended actions:
1. Check disk usage with `df -h` and identify large directories with `du -sh /*`
2. Clean up old log files (check `/var/log/`)
3. Review log rotation configuration
4. Consider moving logs to external storage or reducing log verbosity

Severity: Critical - Immediate action required to prevent service failure.""",

    """**Network Connectivity Issues**

Probable cause: DNS resolution failure, firewall rules blocking traffic, or upstream service degradation.

Recommended actions:
1. Test connectivity with `ping` and `traceroute` to dependent services
2. Check DNS resolution with `nslookup` or `dig`
3. Review recent firewall or security group changes
4. Check status page of external dependencies

Severity: Medium - May impact user experience if prolonged.""",
]


class DemoProvider(LLMProvider):
    """Demo provider that returns predefined responses without calling external APIs."""
    
    def __init__(self, model: str = "demo"):
        self.model = model
    
    async def generate(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        # For alert generation prompts, return structured JSON
        if "Generate exactly 3 alert variants" in prompt:
            return self._generate_alert_variants(prompt)
        
        # For diagnosis prompts, return a random diagnosis
        return random.choice(DEMO_DIAGNOSES)

    async def chat(self, messages: List[Dict[str, Any]], **kwargs) -> str:
        """Implement chat interface for abstract base class."""
        # Convert messages to a single prompt
        prompt = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages])
        return await self.generate(prompt, **kwargs)
    
    def _generate_alert_variants(self, prompt: str) -> str:
        import re
        
        # Extract query from prompt
        query_match = re.search(r'Query: (.+)', prompt)
        query = query_match.group(1).strip() if query_match else "up"
        
        return f"""[
  {{
    "name": "Critical Threshold",
    "description": "Triggers when metric exceeds critical threshold for sustained period",
    "query": "{query}",
    "condition": "> 90",
    "duration": "2m"
  }},
  {{
    "name": "Warning Level",
    "description": "Early warning before critical threshold is reached",
    "query": "{query}",
    "condition": "> 70",
    "duration": "5m"
  }},
  {{
    "name": "No Data Alert",
    "description": "Triggers when metric stops reporting data",
    "query": "{query}",
    "condition": "== 0",
    "duration": "10m"
  }}
]"""