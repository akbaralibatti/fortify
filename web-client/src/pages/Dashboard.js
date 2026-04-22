import React from "react";
import { Link } from "react-router-dom";
import "../App.css";

function Dashboard(){

return(

<div className="app-container">

<div className="app-header">
<h2>Control Center</h2>
</div>

<div style={{
display:"flex",
gap:"20px",
flexWrap:"wrap"
}}>

<Link to="/remote">
<button className="btn-host">
🖥 Remote Access
</button>
</Link>

<Link to="/intruders">
<button className="btn-host">
🚨 Intruder Monitor
</button>
</Link>

<Link to="/lock">
<button className="btn-host">
🔒 System Lock
</button>
</Link>

</div>

</div>

)

}

export default Dashboard
