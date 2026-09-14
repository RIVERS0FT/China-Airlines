/** Original inline vector portraits. Face variations depend only on the permanent employee id. */
export function EmployeePortrait({ id, department = 'flight' }: { id: number; department?: 'flight' | 'ground' }) {
  const skin = ['#eac29e','#d5a17f','#bc8767','#f0d1b5'][id%4]!;
  const hair = ['#273648','#53443b','#403432'][id%3]!;
  return <svg className="employee-portrait" viewBox="0 0 80 80" aria-hidden="true" data-portrait={id%12}>
    <circle cx="40" cy="40" r="39" fill={department==='flight'?'#e0edf5':'#e2efea'}/>
    <path d="M10 80V68Q13 55 40 55Q67 55 70 68V80" fill={department==='flight'?'#315778':'#4b7b70'}/>
    <path d="M30 56L40 69L50 56L45 54H35Z" fill="#fff9ed"/><path d="M37 62H43L45 78H35Z" fill="#d2a64e"/>
    <rect x="33" y="45" width="14" height="15" rx="5" fill={skin}/>
    <ellipse cx="40" cy="33" rx="19" ry="23" fill={skin}/>
    <path d={id%2?'M21 38V23Q22 9 41 9Q60 10 60 26L58 39L54 27Q35 30 28 20L24 38Z':'M21 34Q14 7 40 7Q65 6 60 35L55 24Q45 25 30 16L25 35Z'} fill={hair}/>
    <path d="M29 34H34M46 34H51" stroke="#303846" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="M36 46Q40 49 45 45" fill="none" stroke="#865b4d" strokeWidth="1.7" strokeLinecap="round"/>
    {id%3===0 && <g fill="none" stroke="#526475" strokeWidth="1.6"><rect x="26" y="30" width="12" height="10" rx="3"/><rect x="43" y="30" width="12" height="10" rx="3"/><path d="M38 33H43"/></g>}
    <path d="M17 66H28M52 66H63" stroke="#e6c87a" strokeWidth="3"/>
  </svg>;
}
