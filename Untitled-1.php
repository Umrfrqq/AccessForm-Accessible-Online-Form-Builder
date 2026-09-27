<?php

function calculateBill($unitPrice, $quantity)
{
  
    $totalBill = $unitPrice * $quantity;


    echo "Unit Price: " . $unitPrice . "<br>";
    echo "Quantity: " . $quantity . "<br>";
    echo "Total Bill: " . $totalBill . "<br><br>";
}


calculateBill(100, 2);

calculateBill(250, 4);

calculateBill(75, 5);
?>