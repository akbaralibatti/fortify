import tkinter as tk
from tkinter import messagebox
import sys

# Get password from server
OWNER_PIN = sys.argv[1] if len(sys.argv) > 1 else "1234"


def check_pin(event=None):
    if pin_entry.get() == OWNER_PIN:
        root.destroy()
    else:
        messagebox.showerror("Error", "Wrong PIN")
        pin_entry.delete(0, tk.END)


root = tk.Tk()
root.title("Device Locked")

root.attributes("-fullscreen", True)
root.attributes("-topmost", True)
root.protocol("WM_DELETE_WINDOW", lambda: None)
root.configure(bg="black")

frame = tk.Frame(root, bg="black")
frame.pack(expand=True)

label = tk.Label(
    frame,
    text="🔒 DEVICE LOCKED",
    fg="white",
    bg="black",
    font=("Arial", 40, "bold")
)
label.pack(pady=20)

pin_entry = tk.Entry(frame, show="*", font=("Arial", 20), justify="center")
pin_entry.pack(pady=10)
pin_entry.focus()

unlock_btn = tk.Button(frame, text="Unlock", command=check_pin, font=("Arial", 16))
unlock_btn.pack(pady=10)

root.bind("<Return>", check_pin)

root.mainloop()
